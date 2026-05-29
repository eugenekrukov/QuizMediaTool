# История исправления видео-сикинга

**Проблема:** При клике на вейвформу видео-трека видео не переходило на нужную позицию — оставалось на 0 или возвращалось к 0 после кратковременного сдвига. Аудио-треки работали нормально. Нативные контролы видео (`<video controls>`) тоже работали. Проблема только с программным `video.currentTime = T` из WaveSurfer.

---

## Попытка 1 — `isManualSeekingRef` как защита от ложных событий

**Гипотеза:** Chrome на 144 Гц-дисплеях иногда стреляет `seeked`-событием сразу (с `currentTime ≈ 0`) до реального `seeked` с нужным временем. `isManualSeekingRef = true` во время ручного сика должен был игнорировать эти ложные события.

**Что сделали:** В `handleVideoSeeked` добавили guard `if (isManualSeekingRef.current) return;` — событие полностью игнорировалось пока `isManualSeekingRef = true`.

**Почему не сработало:** Guard блокировал **оба** события — и ложное (v≈0), и реальное с нужным временем. Chrome укладывает оба события в одно окно rAF (~7 мс), поэтому `isManualSeekingRef` был ещё `true` когда приходило настоящее `seeked`.

---

## Попытка 2 — Убрать `isManualSeekingRef` из `handleVideoSeeked`, добавить retry-логику

**Гипотеза:** Раз guard блокирует оба события, нужно пропускать все `seeked` и проверять, попали ли мы в нужную позицию. Если нет — повторить `currentTime = T`.

**Что сделали:**
- Убрали `isManualSeekingRef`-guard из `handleVideoSeeked`
- Добавили `seekPendingRef`, `seekTargetRef`, `seekRetryCountRef` (макс. 6 попыток)
- В `handleVideoSeeked`: если `|videoTime - target| > 0.5` — планируем retry через 250 мс
- Добавили `logSeek()` для диагностики в консоль

**Результат в логах:** Retry запускался циклически. Видео оставалось у 0 или 0.012–0.016. Retries не помогали — каждый раз `videoTime ≈ 0`.

---

## Попытка 3 — Пауза перед сиком, защита `pendingPlayRef`

**Гипотеза:** Chrome не может seekать играющее видео — нужно сначала поставить на паузу, потом seekать, потом возобновить воспроизведение.

**Что сделали:**
- В `seekVideoTo`: `seekPendingRef.current = true` → `v.pause()` → `v.currentTime = t`
- `seekPendingRef = true` выставляется **до** паузы, чтобы `handleVideoPause` не чистил `pendingPlayRef`
- После успешного `seeked`: `handleVideoSeeked` вызывает `video.play()` если `pendingPlayRef = true`

**Результат:** `currentTimeAfter` в логах стал точно `0.000` (раньше было `0.012`). Это оказалось важной подсказкой — точный 0 указывал на более глубокую проблему.

---

## Попытка 4 — Убрать `crossOrigin="anonymous"` с `<video>`

**Гипотеза:** `crossOrigin="anonymous"` заставляет браузер отправлять CORS preflight на Range-запросы. Если сервер не отвечает правильно на OPTIONS с `Access-Control-Allow-Headers: Range`, браузер блокирует Range-запросы, и видео не seekable.

**Что сделали:**
- Убрали `crossOrigin="anonymous"` из `<video>` в `App.jsx`
- Убедились что сервер возвращает `expose_headers: ["Accept-Ranges", "Content-Range", "Content-Length"]`

**Результат:** Не помогло. `seekableEnd: 0.000` в логах сохранялся.

---

## Попытка 5 — Диагностическое логирование `seekable`

**Гипотеза:** Нужно понять, что именно Chrome видит в момент сика — не бороться со следствиями, а найти настоящую причину.

**Что сделали:** Добавили в `seekVideoTo` логирование после `v.currentTime = t`:
```javascript
seekableLen: v.seekable.length
seekableEnd: v.seekable.end(seekableLen - 1)
currentTimeAfter: v.currentTime
```

**Результат — НАЙДЕНА КОРНЕВАЯ ПРИЧИНА:**
```
seekVideoTo:after — currentTimeAfter: 0.000, seekableLen: 1.000, seekableEnd: 0.000
```

`video.seekable.end(0) = 0` — Chrome считает, что видео можно seekать только до позиции 0. Любое `currentTime = T` при T > 0 Chrome молча обрезает до 0. Это объясняет **все** предыдущие симптомы.

---

## Попытка 6 — fMP4-дефрагментация (текущее исправление)

**Диагностика:** `seekable.end = 0` при `bufferedEnd = 67.3` и `readyState = 4` — это сигнатура fragmented MP4 (fMP4). yt-dlp скачивает YouTube-видео в формате DASH, который является fMP4. У fMP4 есть `moov`-бокс в начале файла, но он содержит дочерний бокс `mvex` (Movie Extends), что указывает на фрагментированную структуру. Chrome не может построить seekable-диапазон для fMP4 без SIDX-индекса.

**Почему старый faststart-код не помогал:** Функция `_mp4_has_faststart` находила `moov` перед `mdat` и возвращала `True` — "faststart уже применён, пропускаем". Файл оставался fMP4 навсегда.

**Что сделали в `tracks.py`:**

1. Добавили `_mp4_is_fragmented(video_path)` — ищет `mvex` внутри `moov`:
   ```python
   def _mp4_is_fragmented(video_path: Path) -> bool:
       # Читаем первые 512 КБ, находим moov, внутри ищем mvex
       # Если mvex найден — это fMP4, Chrome не умеет в нём seekать
   ```

2. Изменили `_ensure_mp4_faststart` — если файл fMP4, принудительно запускаем ffmpeg независимо от положения moov:
   ```python
   is_fragmented = _mp4_is_fragmented(video_path)
   if not is_fragmented and _mp4_has_faststart(video_path):
       return False  # OK, пропускаем
   # Иначе: запускаем ffmpeg -c copy -movflags +faststart
   # ffmpeg автоматически дефрагментирует fMP4 в стандартный MP4
   ```

3. ffmpeg с флагом `-movflags +faststart` и `-c copy` делает сразу два действия:
   - Дефрагментирует fMP4 → стандартный MP4
   - Перемещает moov в начало файла

**Почему это должно сработать:** После дефрагментации Chrome читает полный `moov`, узнаёт длительность и все `trak`, выставляет `seekable = 0 to duration`, и `currentTime = T` работает для любого T в диапазоне.

**Как применить:** Перезапустить backend. Startup-код в `main.py` автоматически обработает все `.mp4` в папке `downloads/`. Лог должен показать:
```
fMP4 detected (mvex present), will defragment+faststart: video.mp4
defragmented+faststart applied: video.mp4
```

---

## Итоговая цепочка причин

```
yt-dlp (DASH) → скачивает fMP4
    → _mp4_has_faststart видит moov перед mdat → возвращает True
    → _ensure_mp4_faststart пропускает файл
    → файл остаётся fMP4
    → Chrome: video.seekable.end(0) = 0
    → video.currentTime = T обрезается до 0
    → seek всегда возвращает позицию 0
```

**Решение:** Детектировать fMP4 по наличию `mvex` в `moov` и принудительно дефрагментировать через ffmpeg.

---

## Попытка 7 — Убрать retry-цикл, заменить на timeout-give-up

**Симптом:** Даже без воспроизведения перемотка через ~1.5с сбрасывалась на 0. Лог показывал `onSeeked→missed:retry-fire` × 6, затем `seekWaveSurferTo → 0.000`.

**Найденная причина в логике frontend:** Retry-механизм (6 попыток × 250 мс) сам себя ломал: каждое повторное `video.currentTime = target` **отменяет** текущий Range-запрос браузера и запускает новый ложный `seeked` (currentTime=0). Браузер никогда не успевает завершить настоящий seek. Плюс: после give-up `seekTargetRef.current` оставался старым значением, и кнопка Play снова запускала провальный seek.

**Что сделали в `useMediaPlayer.js`:**
- Убраны `seekRetryCountRef`, `MAX_SEEK_RETRIES`, весь retry-цикл
- В `handleVideoSeeked` при промахе: ждём реальный `seeked` (не трогаем `currentTime` повторно)
- Если за 3 секунды реальный `seeked` не пришёл — `timeout:giveup` с `seekTargetRef.current = vt` (кнопка Play разблокируется) и `pendingPlayRef = false`
- Убран `seekRetryCountRef.current = 0` из cleanup-эффекта при смене трека

**Результат в логах:**
```
interaction→video        seek=24.191 was=0.000
seekVideoTo             → 24.191
seekVideoTo:after        currentTimeAfter: 0.000, seekableEnd: 0.000
onSeeked→pending:done    v=0.000 target=24.191 MISSED
onSeeked→missed:waiting  v=0.000 target=24.191
onSeeked→timeout:giveup  (+3010ms)
seekWaveSurferTo        → 0.000
```

**Вывод:** Retry-цикл устранён, кнопка Play больше не зависает. НО `seekableEnd: 0.000` сохраняется — значит бэкенд-фикс (Попытка 6) ещё не вступил в силу для конкретных файлов. Либо файлы не были перепроцессированы после деплоя, либо `_mp4_is_fragmented` не детектирует проблему в этих файлах.

---

## Текущее состояние

**Бэкенд-фикс (Попытка 6) — код применён**, `_mp4_is_fragmented()` и обновлённый `_ensure_mp4_faststart()` присутствуют в `tracks.py`. Нужно убедиться, что:

1. Бэкенд перезапущен после правки
2. Существующие видеофайлы были перепроцессированы (startup-код или ручной вызов `_ensure_mp4_faststart`)
3. В логах бэкенда есть строки `fMP4 detected` / `defragmented+faststart applied`

Если `seekableEnd` по-прежнему 0 после этого — искать причину глубже: возможно, `_mp4_is_fragmented` не находит `mvex` в конкретных файлах yt-dlp.

---

## Файлы изменённые за все сессии

| Файл | Изменения |
|------|-----------|
| `frontend/src/hooks/useMediaPlayer.js` | seekVideoTo, handleVideoSeeked, handleVideoPause, seekPendingRef, ~~seekRetryCountRef~~, seekTargetRef, logSeek(), диагностические логи; убран retry-цикл (Попытка 7) |
| `frontend/src/App.jsx` | Убран `crossOrigin="anonymous"` с `<video>` |
| `backend/app/api/tracks.py` | Добавлен `_mp4_is_fragmented()`, обновлён `_ensure_mp4_faststart()` |
