# Quiz Media Tool — Technical Summary & Architecture Baseline

## Обзор проекта
Quiz Media Tool — специализированный веб-инструмент для авторов квизов. Два независимых модуля:
- **🎵 Медиа** — поиск YouTube, пакетная загрузка аудио/видео, waveform-редактор, нарезка отрезков вопрос/ответ.
- **🖼 Изображения** — библиотека изображений, canvas-редактор с обрезкой и фигурами, сохранение квизовых пар «вопрос/ответ».

---

## Бэкенд (Python / FastAPI)

**`main.py`** — точка входа. CORS `allow_origins=["*"]`. Роутеры: `/download`, `/tracks`, `/export`, `/audio`, `/search`, `/images`, `/convert`.

**`app/api/download.py`** — пакетная загрузка. JSON `DownloadRequest`: массив `urls` (до 50), `download_type` (`"audio"` / `"video"` / `"ogg"` / `"ogv"`), опциональный `cookies_from_browser` (chrome / firefox / edge и др.). Возвращает `downloaded` и `failed`.

**`app/services/downloader.py`** — обёртка `yt_dlp`. Аудио: MP3 192 kbps. Видео: MP4 `bestvideo+bestaudio/best`. OGG: Vorbis quality 5. OGV: Theora+Vorbis через `FFmpegVideoConvertor`. Поддержка `cookiesfrombrowser` — передаётся как кортеж `(browser,)`. `SUPPORTED_TYPES = ("audio", "video", "ogg", "ogv")`.

**`app/api/convert.py`** — конвертация уже скачанных файлов. `POST /convert/` принимает `filenames` + `target_format`. Поддерживаемые форматы: `ogg`, `ogv`, `mp3`, `mp4`, `wav`, `webm`. Делегирует в `converter.py`.

**`app/services/converter.py`** — FFmpeg конвертация через `subprocess.run`. `FORMAT_PRESETS` — словарь с расширением и аргументами FFmpeg для каждого формата. Выполняется в `run_in_executor`.

**`app/api/tracks.py`** — инвентаризация `downloads/`. Фильтрует `.mp3/.mp4/.webm/.mkv/.avi/.mov/.m4a/.wav/.ogg/.ogv`. `DELETE /{track_name}`. `POST /convert-to-audio/{filename}` — видео → MP3 через FFmpeg (`-vn -acodec libmp3lame -ab 192k -ar 44100`); если MP3 уже есть — возвращает без перекодирования. Поддерживает `.mp4/.webm/.mkv/.avi/.mov` (не `.ogv` — он обрабатывается как аудио).

**`app/api/audio.py`** — стриминг через `FileResponse` с Range-support. **Не заменять на `StreamingResponse`** — сломает seek.

**`app/api/export.py`** — FFmpeg нарезка. Папка `downloads/Quiz/`. Стратегия по типу:
- Видео (`.mp4/.webm/.mkv/.avi/.mov`): `-c copy` — без перекодирования, мгновенно.
- Аудио (`.mp3` и др.): `-vn -c:a libmp3lame -q:a 2` — перекодирование для точной нарезки.
- OGG/OGV нарезаются как аудио.

**`app/api/search.py`** — поиск YouTube без API-ключей через `yt_dlp` (`ytsearch{limit}:{query}`, `extract_flat=True`). До 12 результатов: `id`, `title`, `url`, `duration`, `thumbnail`, `channel`, `view_count`. Выполняется в `run_in_executor`.

---

## Модуль изображений (бэкенд)

**`app/api/images.py`** — 10 эндпоинтов под префиксом `/images/`:

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/` | Список файлов в images-папке + текущий путь |
| `GET` | `/settings` | Текущий путь к папке |
| `POST` | `/settings` | Сохранить путь к папке (`images_config.json`) |
| `GET` | `/pick-folder` | Открыть системный диалог выбора папки (tkinter, threaded) |
| `GET` | `/file/{filename}` | Отдать файл (для `<img src>`) |
| `POST` | `/upload` | Загрузить файл; если уже есть — `already_existed=true` без перезаписи |
| `DELETE` | `/{filename}` | Удалить из папки |
| `POST` | `/process` | Ресайз+кроп → base64-превью (без сохранения) |
| `POST` | `/save-quiz-pair` | Сохранить пару: `{name} вопрос.ext` (с фигурами) + `{name} ответ.ext` (без) |
| `POST` | `/save-single` | Сохранить одно изображение без квизовой пары |

**Pydantic-схемы**: `ResizeParams`, `CropParams`, `OverlayParams` (поля: `shape`, `x/y/width/height`, `color: list[int]`, `opacity`, `angle: float`), `SaveQuizPairRequest` (принимает `overlays: list[OverlayParams]`), `SaveSingleRequest`.

**`app/services/image_processor.py`** — вся Pillow-логика:
- `load_config/save_config/get_images_dir/set_images_dir` — персистентность пути в `images_config.json`.
- `list_images(dir)` — список файлов с метаданными, сортировка по дате изменения.
- `apply_resize(img, w, h, keep_aspect)` — LANCZOS ресайз.
- `apply_crop(img, x, y, w, h)` — PIL crop с clamp.
- `apply_overlay(img, overlay_dict)` — RGBA alpha_composite. Поддерживает `rectangle`/`ellipse` и поворот (`overlay_layer.rotate(-angle, center=(cx,cy))`). Возвращает RGBA для цепочки вызовов.
- `process_preview(...)` → `{base64, width, height}`.
- `save_quiz_pair(...)` — применяет resize+crop, сохраняет ответ (без оверлеев), затем применяет все оверлеи последовательно и сохраняет вопрос.
- `save_single(...)` — сохраняет одно изображение (resize+crop, без оверлея).

Поддерживаемые форматы: `.jpg/.jpeg/.png/.gif/.webp/.bmp/.tiff/.tif`.

---

## Фронтенд (React 19 / Vite 8)

Двухколоночный layout: левая панель (300px) + правая (`flex:1`).

### Архитектура (после рефакторинга)

`App.jsx` — тонкий shell (~1300 строк): только JSX + сборка хуков. Вся логика вынесена в:

| Файл | Строк | Ответственность |
|------|-------|-----------------|
| `src/api.js` | 89 | Все `fetch`-вызовы к бэкенду (чистые функции, без state) |
| `src/utils.js` | 19 | `getFileType`, `formatTime`, `formatDuration` |
| `hooks/useMediaPlayer.js` | ~600 | WaveSurfer init, синхронизация видео, регионы, воспроизведение |
| `hooks/useQuizData.js` | 85 | `savedQuizData`, сохранение отрезков, экспорт |
| `hooks/useSearch.js` | 74 | Поиск YouTube/Spotify, `downloadFromSearch` |
| `hooks/useDownload.js` | 76 | Скачивание по URL, прогресс |
| `hooks/useImages.js` | 71 | Список изображений, выбор, удаление, смена папки |
| `hooks/useTracks.js` | 34 | Список треков, `currentTrack`, `hasUnsavedChanges` |
| `components/DownloadProgressBar.jsx` | 53 | Полоса прогресса скачивания |

`deleteTrack` — координирующая функция в `App.jsx` (вызывает `setTracks` + `deleteTrackQuizData` + `resetPlayer` из разных хуков).

**Ключевые паттерны хуков:**
- `useMediaPlayer` принимает `savedQuizData` через ref (не state) — плеер не пересоздаётся при изменении отрезков.
- `onSavedQuizData` / `onHasUnsavedChanges` — коллбэки из `App.jsx` для обратной записи в родительский state.
- `useSearch` / `useDownload` принимают `{ onTracksRefresh }` — вызывают `fetchTracks()` после успешного скачивания.

### Верхний уровень — две вкладки

**🎵 Медиа** — весь аудио/видео функционал (поиск, загрузка, редактор).
**🖼 Изображения** — модуль изображений.

### Форматы скачивания

Вкладка «По ссылке» — выпадающий список: MP3 / MP4 / OGG / OGV.

Результаты поиска — кнопки в две строки: `🎵 MP3` + `🎬 MP4` (строка 1), `📎 OGG` + `📎 OGV` (строка 2, для LibreOffice).

Панель превью — четыре кнопки: MP3, MP4, OGG, OGV (рендерятся из массива, не дублируются).

**OGG** — аудио Vorbis, отображается в приложении как аудио (🎵), вставляется в LibreOffice Impress как звук без ошибки `E_NOTIMPL`.

**OGV** — видео Theora+Vorbis, браузер не воспроизводит (Chrome/Edge не поддерживают Theora), поэтому в приложении показывается как аудио с waveform-волной. В LibreOffice вставляется как видеообъект.

`getFileType` — `.ogv` **не входит** в `videoExtensions` (намеренно: чтобы не пытаться рендерить через `<video>`). Функция живёт в `src/utils.js`.

**`cookies_from_browser`** — опциональное поле в `DownloadRequest`. Решает ошибку «This video is not available» для гео-блокированных видео. Браузер должен быть запущен на той же машине с активной сессией YouTube.

При смене изображения в библиотеке — проверка `imageEditorDirtyRef` (ref в `useImages`, передаётся в `App.jsx`). Если есть несохранённые изменения — `window.confirm`. `ImageEditor` сообщает о грязном состоянии через проп `onDirtyChange(bool)`.

### ImageLibrary.jsx (левая панель, вкладка Изображения)

- Поле пути к папке: click → edit → Enter/Esc. Кнопка 📁 открывает системный диалог (`GET /images/pick-folder`).
- Кнопка «↺» — обновить список.
- Кнопка «+ Добавить» — `<input type="file" multiple>`.
- Превью-список: thumbnail 58×40, имя, размер, кнопка 🗑️ (DELETE).

### ImageEditor.jsx (правая панель)

**Canvas**: `position:absolute; top:0; left:0` внутри `position:relative; flex:1; minWidth:0` контейнера. `ResizeObserver` синхронизирует `canvSize` с реальными размерами контейнера. `getLayout` добавляет `pad=14px` со всех сторон, чтобы ручки не выходили за края.

**Три режима** (кнопки в шапке панели управления):

**«Размер»** — поля ширины/высоты, чекбокс «Сохранять пропорции», кнопка «Применить» (информирует, что размер применится при сохранении). Размер всегда передаётся в `save-*` как `resizeParam`.

**«Обрезка»** — затемнение снаружи выделения, сетка третей, 8 drag-ручек. Поля X/Y/Ш/В. Кнопки «Применить» (`cropEnabled=true`) и «Сбросить». Чекбокс убран — состояние `cropEnabled` хранится в компоненте.

**«Фигура»** — список оверлеев (`overlays: [{x,y,w,h,shape,color,opacity,angle}]`). Кнопка «+ Добавить». Клик на элемент списка = выбор (`selOvr`). Кнопка 🗑️ и клавиша Delete (не срабатывает в input/select) удаляют выбранную фигуру. Параметры выбранной фигуры: форма, цвет, непрозрачность, поворот (слайдер + числовое поле 0–359°). Canvas рисует все фигуры с `ctx.rotate(angle*PI/180)` вокруг центра; ручки на bounding-box выбранной фигуры.

**Секция «Сохранить»**: название, формат (JPEG/PNG/WebP), папка вывода (с кнопкой 📁). Поведение кнопки зависит от текущего режима:
- Режим «Размер» или «Обрезка» → «Сохранить изображение» → `POST /images/save-single`.
- Режим «Фигура» → «Сохранить вопрос и ответ» (неактивна при `overlays.length===0`) → `POST /images/save-quiz-pair`.

**Drag&drop**: дроп файла на canvas или drop-зону загружает файл через `/images/upload` и сразу открывает его.

**Dirty-tracking**: `isDirty` становится `true` при любом изменении (drag ручки, ввод размеров, добавление/удаление фигуры). Сбрасывается после успешного сохранения. Заголовок показывает «· изменено».

---

## Структура директорий

```
quiz-media-tool/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── audio.py           # FileResponse с Range-support
│   │   │   ├── convert.py         # POST /convert/ — конвертация файлов между форматами
│   │   │   ├── download.py        # Пакетная загрузка: audio/video/ogg/ogv + cookies_from_browser
│   │   │   ├── export.py          # FFmpeg нарезка (-c copy для видео)
│   │   │   ├── images.py          # Модуль изображений (10 эндпоинтов)
│   │   │   ├── search.py          # Поиск YouTube через yt-dlp
│   │   │   ├── tracks.py          # Список (.ogg/.ogv включены), удаление, конвертация видео→MP3
│   │   │   └── __init__.py
│   │   ├── services/
│   │   │   ├── converter.py       # FFmpeg конвертация: ogg/ogv/mp3/mp4/wav/webm
│   │   │   ├── downloader.py      # yt_dlp: MP3/MP4/OGG/OGV + cookiesfrombrowser
│   │   │   ├── exporter.py        # Не используется (dead code)
│   │   │   ├── image_processor.py # Pillow: resize, crop, overlay, save
│   │   │   └── storage.py         # JSON-персистентность проектов
│   │   └── main.py
│   ├── downloads/                  # Скачанные файлы (MP3, MP4, OGG, OGV)
│   │   └── Quiz/                  # Финальные нарезанные отрезки
│   ├── images_config.json          # Путь к папке изображений (авто)
│   └── requirements.txt           # fastapi uvicorn yt-dlp pydub Pillow python-multipart
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Shell: JSX + сборка хуков (~1300 строк)
│   │   ├── api.js                 # Все fetch-вызовы к бэкенду (чистые функции)
│   │   ├── utils.js               # getFileType, formatTime, formatDuration
│   │   ├── hooks/
│   │   │   ├── useMediaPlayer.js  # WaveSurfer + видео-синхронизация + регионы
│   │   │   ├── useQuizData.js     # savedQuizData, сохранение отрезков, экспорт
│   │   │   ├── useSearch.js       # Поиск YouTube/Spotify + downloadFromSearch
│   │   │   ├── useDownload.js     # Скачивание по URL + прогресс
│   │   │   ├── useImages.js       # Галерея изображений
│   │   │   └── useTracks.js       # Список треков, currentTrack, hasUnsavedChanges
│   │   ├── components/
│   │   │   └── DownloadProgressBar.jsx
│   │   ├── ImageEditor.jsx        # Canvas-редактор изображений (681 строк)
│   │   ├── ImageLibrary.jsx       # Левая панель библиотеки (180 строк)
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
└── ffmpeg-master-latest-win64-gpl-shared/
```

---

## Известные особенности и решения

**Аудио/Видео модуль:**
- **Скорость экспорта видео**: `-c copy` — нарезка 40-секундного отрезка занимает секунды вместо десятков минут. Небольшой сдвиг начала к ближайшему keyframe приемлем для квизов.
- **Синхронизация видео ↔ WaveSurfer**: `setInterval` 50 мс, корректирует при расхождении > 0.1 с.
- **`FileResponse` vs `StreamingResponse`**: только `FileResponse` поддерживает Range-запросы → seek работает.
- **`savedQuizDataRef`**: ref-копия данных регионов — плеер не пересоздаётся при изменении `savedQuizData`.
- **`togglePlayRef`**: ref на функцию toggle — слушатель пробела всегда видит актуальное состояние без зависимостей в `useEffect`.
- **OGV в браузере**: Chrome/Edge не поддерживают Theora, поэтому OGV не входит в `videoExtensions` — показывается через waveform (WaveSurfer конвертирует аудиодорожку в MP3 на лету). Назначение OGV — LibreOffice, не браузер.
- **LibreOffice совместимость**: MP3/MP4 вызывают ошибку `E_NOTIMPL (hr=0x80004001)` в LibreOffice на Windows. OGG (аудио) и OGV (видео) вставляются без ошибок.
- **cookies_from_browser**: при ошибке «This video is not available» — передать имя браузера (chrome/firefox/edge и др.). yt-dlp читает cookies из профиля браузера для обхода гео-блокировки.
- **Seek сбрасывался на начало (аудио)**: в обработчике `interaction` (WaveSurfer) вызов `ws.setTime(seekTime)` был **избыточным** — WaveSurfer уже выполнил seek до эмита события. Второй `setTime()` запускал повторный seek на audio element в `MediaElement` backend; браузер в момент `timeupdate` во время seeking кратковременно возвращал `currentTime = 0`, и курсор прыгал в начало. **Решение**: убран повторный `ws.setTime()` из ветки `interaction` для аудио-файлов (`useMediaPlayer.js`). Остались только `setCurrentTime(seekTime)` (React-состояние) и условный `ws.play()` для возобновления воспроизведения.

**Модуль изображений:**
- **Canvas overflow fix**: canvas `position:absolute` внутри relative-контейнера + `minWidth:0` на flex-обёртке + 14px padding в `getLayout` — ручки не уходят под правую панель.
- **Поворот оверлея (Pillow)**: `overlay_layer.rotate(-angle, expand=False, center=(cx,cy))` — минус перед углом, т.к. PIL вращает против часовой стрелки.
- **Цепочка оверлеев**: `apply_overlay` возвращает RGBA (не RGB), чтобы можно было применять несколько фигур последовательно; конвертация в RGB только перед `save()`.
- **Выбор папки**: `tkinter.filedialog.askdirectory` в отдельном `threading.Thread` (daemon) — FastAPI не блокируется; таймаут 60 с.
- **Delete в браузере**: `window.addEventListener("keydown")` проверяет `document.activeElement.tagName` — не удаляет фигуру при фокусе на input/select.
- **Dirty state**: `imageEditorDirtyRef` в App.jsx (не state — не вызывает ре-рендер); `handleSelectImage` проверяет ref перед сменой изображения.
