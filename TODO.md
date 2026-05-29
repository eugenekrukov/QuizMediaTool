# TODO — Quiz Media Tool

## 🔴 Главная задача: синхронизация видео и аудиодорожки

Сейчас `<video controls>` и WaveSurfer играют **независимо**.

### Что нужно сделать
- Клик на волне WaveSurfer → видео прыгает на ту же позицию
- Play/Pause на видео → WaveSurfer тоже Play/Pause
- Перемотка нативным контролом видео → WaveSurfer обновляет позицию
- Кнопка ▶/⏸ в UI управляет обоими

### Подход
- WaveSurfer в режиме `muted` (звук идёт из `<video>`)
- `videoRef` передаётся в `useMediaPlayer`
- Слушаем события `play`, `pause`, `seeked`, `timeupdate` на `<video>`
- При seek на волне: `video.currentTime = wsTime`, не трогаем WaveSurfer
- Синхронизация drift: интервал 50мс сравнивает позиции, корректирует WaveSurfer

### Ключевой урок из предыдущих попыток (см. SEEK_FIX_HISTORY.md)
- НЕ делать retry при промахе seek — каждый повторный `currentTime =` отменяет Range-запрос браузера
- НЕ блокировать seeked-события через флаги — Chrome стреляет несколько seeked подряд
- Достаточно одного timeout (3с) на give-up, без retry

---

## 📋 Прочее

- [ ] Проверить экспорт сегментов
- [ ] Удалить `SeekDebugPanel.jsx` (не используется)
- [ ] Удалить `fix-seek.patch` из корня

## ✅ Сделано

- Убрана вся сломанная sync-логика (seekPendingRef, retry-цикл, ~200 строк)
- Убран Spotify
- Видеоплеер — нативный `<video controls>`
- WaveSurfer для всего (видео конвертируется в MP3)
- `_mp4_is_fragmented` читает полный moov (до 16 МБ)
