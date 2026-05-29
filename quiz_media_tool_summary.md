# Quiz Media Tool — состояние проекта (29 мая 2026)

## Репозиторий

- GitHub: https://github.com/eugenekrukov/QuizMediaTool
- Ветка: `main`
- Последний коммит: `2501bc7` — "Sync video player and WaveSurfer"
- **Внимание:** в рабочей папке есть незакоммиченные изменения в `App.jsx` и `useMediaPlayer.js` (финальная доработка отрисовки волны). Нужно закоммитить и запушить:

```bash
cd quiz-media-tool
rm .git/index.lock        # если файл ещё существует
git add frontend/src/App.jsx frontend/src/hooks/useMediaPlayer.js
git commit -m "Fix waveform rendering: decode audio peaks client-side, pass via peaks option"
git push
```

---

## Что было сделано в этой сессии

### Задача: синхронизация видеоплеера и WaveSurfer

До начала сессии: `<video controls>` и WaveSurfer работали независимо — у каждого своя позиция.

### Решение (итоговое, рабочее)

**`frontend/src/hooks/useMediaPlayer.js`**

Для видеофайлов WaveSurfer инициализируется так:

```js
WaveSurfer.create({
  container: containerRef.current,
  media: videoRef.current,   // WaveSurfer владеет seek/play/pause видеоэлемента
  peaks: [peaks],            // массив пиков, декодированных клиентски из MP3
  duration: audioDuration,   // длительность из MP3
  // url НЕ передаётся — иначе WaveSurfer перезапишет src видеоэлемента
})
```

**Почему именно так:**

1. WaveSurfer v7: если передать `media: videoElement` + `url: audioFileUrl`, то внутри `player.js::setSrc()` WaveSurfer перезапишет `video.src` на аудиофайл → видеокартинка исчезает.
2. Если передать только `media` без `url` — WaveSurfer пытается декодировать сам видеофайл через `AudioContext.decodeAudioData()`. На практике не работает для MP4.
3. Финальное решение: конвертируем видео в MP3 (серверно), затем **клиентски** декодируем MP3 через `AudioContext`, вычисляем пики (800 точек), передаём через опцию `peaks`. WaveSurfer рисует волну из пиков, не трогая `src` видео.

**`frontend/src/App.jsx`**

`<video>` теперь **всегда в DOM**, только скрыт через `display:none` когда не видео. Это критично: `videoRef.current` должен существовать в момент инициализации WaveSurfer.

```jsx
<div style={{ display: currentFileType === "video" && !isConverting ? "block" : "none" }}>
  <video ref={videoRef} src={currentTrack ? url : ""} controls ... />
</div>
```

### Что убрано

- Вся ручная sync-логика (play/pause/seeked слушатели, `seekingFromWSRef`)
- Отдельный `Audio` элемент для WaveSurfer при работе с видео

---

## Архитектура плеера (текущее состояние)

### Аудиофайлы
```
WaveSurfer.create({ url: audioFileUrl })
```

### Видеофайлы
```
1. convertVideoToAudioAPI(currentTrack) → audioFile (MP3 на сервере)
2. fetch(audioFileUrl) → ArrayBuffer → AudioContext.decodeAudioData → peaks[800]
3. WaveSurfer.create({ media: videoRef.current, peaks: [peaks], duration })
```

WaveSurfer управляет `<video>` напрямую: seek, play, pause — всё через него. Нативные контролы видео тоже работают.

---

## Структура проекта

```
quiz-media-tool/
├── backend/              # Python/FastAPI (порт 8000)
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       ├── utils.js
│       ├── components/
│       │   ├── DownloadProgressBar.jsx
│       │   └── SeekDebugPanel.jsx   # не используется, можно удалить
│       └── hooks/
│           ├── useMediaPlayer.js    # основная логика плеера
│           ├── useQuizData.js
│           ├── useTracks.js
│           ├── useSearch.js
│           ├── useDownload.js
│           └── useImages.js
├── ffmpeg-master-latest-win64-gpl-shared/
├── start.bat
└── TODO.md
```

---

## Незакрытые задачи

- [ ] Проверить экспорт сегментов
- [ ] Удалить `SeekDebugPanel.jsx` (не используется)
- [ ] Удалить `fix-seek.patch` из корня

---

## Запуск

```bash
# Бэкенд
start.bat   # или: cd backend && uvicorn main:app --reload

# Фронтенд
cd frontend && npm run dev
```

Бэкенд: `http://127.0.0.1:8000` | Фронтенд: `http://localhost:5173`
