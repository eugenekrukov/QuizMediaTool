# Plan: Модуль работы с изображениями

> Контекст проекта: React + FastAPI. Аудио/видео часть уже готова.
> Стек: React (Vite), FastAPI (Python), Pillow для обработки изображений на бэкенде.

---

## Архитектурный обзор

Новый функционал реализуется как отдельная вкладка «🖼 Изображения» в левой панели
(рядом с «🔍 Поиск» и «🔗 По ссылке»). Правая панель при активной вкладке показывает
Image Editor — аналог аудио-редактора, но для картинок.

```
Левая панель                    Правая панель (Image Editor)
┌──────────────────────┐        ┌───────────────────────────────────────┐
│ 🔍 Поиск | 🔗 Ссылка │        │  [Drag & Drop зона]                   │
│ 🖼 Изображения  ← NEW│        │                                       │
│                      │        │  ────────────────────────────────     │
│  📁 Папка: [browse]  │        │  Инструменты: Ресайз | Обрезка        │
│  ┌──────────────────┐│        │                                       │
│  │ preview1.jpg  🗑 ││        │  ────────────────────────────────     │
│  │ preview2.webp 🗑 ││        │  Подготовка к квизу:                  │
│  │ preview3.png  🗑 ││        │  [ Вопрос: фигура поверх ]           │
│  └──────────────────┘│        │  [ Ответ: без фигуры     ]           │
└──────────────────────┘        │  Название: [____________]             │
                                │  [ 💾 Сохранить оба варианта ]       │
                                └───────────────────────────────────────┘
```

---

## Этап 1: Backend — новый роутер `images.py`

**Файл:** `backend/app/api/images.py`

### Новые эндпоинты

| Метод | Путь | Назначение |
|-------|------|-----------|
| GET | `/images/` | Список файлов в images-папке |
| GET | `/images/file/{filename}` | Отдать файл (для превью в браузере) |
| POST | `/images/upload` | Загрузить файл (из drag&drop или из сторонней папки) |
| DELETE | `/images/{filename}` | Удалить файл из images-папки |
| GET | `/images/settings` | Получить текущий путь к images-папке |
| POST | `/images/settings` | Сохранить путь к images-папке |
| POST | `/images/process` | Ресайз + обрезка (возвращает base64 превью) |
| POST | `/images/save-quiz-pair` | Сохранить пару вопрос/ответ с наложением |

### Конфигурация папки

Путь хранится в файле `backend/images_config.json`:
```json
{
  "images_dir": "C:/Users/e-kru/quiz-media-tool/backend/images"
}
```

При старте сервера папка создаётся автоматически если не существует.

### Зависимости (добавить в `requirements.txt`)
```
Pillow>=10.0.0
```

### Детали обработки изображений (Pillow)

**Поддерживаемые форматы:** JPEG, PNG, GIF, WebP, BMP, TIFF

**Эндпоинт `/images/process`** принимает:
```json
{
  "filename": "photo.jpg",
  "resize": { "width": 800, "height": 600, "keep_aspect": true },
  "crop": { "x": 10, "y": 20, "width": 400, "height": 300 }
}
```
Возвращает base64-строку обработанного изображения для мгновенного превью без сохранения файла.

**Эндпоинт `/images/save-quiz-pair`** принимает:
```json
{
  "filename": "photo.jpg",
  "custom_name": "Угадай животное",
  "output_format": "jpg",
  "output_dir": "C:/Users/e-kru/quiz-media-tool/backend/downloads/Quiz",
  "resize": { "width": 800, "height": 600, "keep_aspect": true },
  "crop": { "x": 0, "y": 0, "width": 800, "height": 600 },
  "overlay": {
    "shape": "rectangle",
    "x": 100, "y": 100,
    "width": 300, "height": 200,
    "color": [30, 30, 30],
    "opacity": 220
  }
}
```
Сохраняет два файла:
- `Угадай животное вопрос.jpg` — с наложенной фигурой
- `Угадай животное ответ.jpg` — оригинал (после ресайза/кропа)

**Логика Pillow для наложения фигуры:**
```python
from PIL import Image, ImageDraw

def apply_overlay(img: Image.Image, overlay: dict) -> Image.Image:
    overlay_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay_layer)
    color = tuple(overlay["color"]) + (overlay["opacity"],)  # RGBA
    x, y, w, h = overlay["x"], overlay["y"], overlay["width"], overlay["height"]
    if overlay["shape"] == "rectangle":
        draw.rectangle([x, y, x + w, y + h], fill=color)
    elif overlay["shape"] == "ellipse":
        draw.ellipse([x, y, x + w, y + h], fill=color)
    base = img.convert("RGBA")
    result = Image.alpha_composite(base, overlay_layer)
    return result.convert("RGB")
```

---

## Этап 2: Frontend — вкладка «Изображения» в левой панели

**Файл:** `frontend/src/App.jsx` — добавить третью вкладку `"images"` и state для неё.

### Новые state-переменные

```js
const [imagesDir, setImagesDir] = useState("");        // путь к преднастроенной папке
const [imageFiles, setImageFiles] = useState([]);      // список файлов в папке
const [selectedImage, setSelectedImage] = useState(null); // { filename, url } — выбранное фото
const [imageDirInput, setImageDirInput] = useState(""); // инпут редактирования пути
```

### Компонент левой панели для вкладки «images»

```
┌─────────────────────────────────┐
│ Папка с изображениями:           │
│ [C:/Users/.../images    ] [📂]   │
│                                  │
│ ┌───────────────────────────┐   │
│ │ 🖼  photo1.jpg         🗑 │   │
│ │ [превью 80×50]             │   │
│ │ 🖼  banner.webp        🗑 │   │
│ │ [превью 80×50]             │   │
│ └───────────────────────────┘   │
└─────────────────────────────────┘
```

Превью грузятся через `GET /images/file/{filename}`.

Клик по превью → открывает изображение в правой панели (Image Editor).

---

## Этап 3: Frontend — Image Editor (правая панель)

Отдельный React-компонент `ImageEditor.jsx` (новый файл).

### Структура компонента

```
ImageEditor
├── DropZone              — Drag & Drop зона
├── ImageCanvas           — Canvas для отображения + интерактивного оверлея
├── ResizeCropControls    — Контролы ресайза и кропа
├── QuizOverlayControls   — Настройки фигуры вопроса
└── SaveControls          — Имя файла, формат, кнопка сохранения
```

### 3.1 DropZone

```jsx
// Поддерживаемые типы: image/jpeg, image/png, image/gif, image/webp, image/bmp
// При drop:
//   1. Если файл ещё не в images-папке → POST /images/upload
//   2. setSelectedImage({ filename, url })
```

HTML5 Drag & Drop API + обработчик `onDrop`, `onDragOver`, `onDragLeave`.
Визуально: пунктирная рамка, меняет цвет при hover.

### 3.2 ImageCanvas — интерактивная обрезка и оверлей

**Технология:** HTML Canvas + React refs.

**Режимы:**
- `"view"` — просто показывает изображение
- `"crop"` — отображает draggable/resizable прямоугольник обрезки
- `"overlay"` — отображает draggable/resizable фигуру оверлея (тёмный прямоугольник или эллипс)

**Реализация кропа:**
- Рисуем на canvas изображение
- Поверх — полупрозрачный серый overlay на всю область вне кропа
- Светлый прямоугольник = зона кропа, 8 ручек по углам и серединам сторон
- Mouse events: mousedown → определяем что тащим (весь rect или ручку), mousemove → пересчёт, mouseup → фиксация

**Реализация оверлея вопроса:**
- Рисуем изображение (уже с кропом, если есть)
- Поверх — тёмная фигура (цвет + прозрачность настраиваются)
- Такие же 8 ручек для ресайза/перемещения

> Ключевой момент: canvas показывает превью в реальном времени, но финальная обработка
> происходит на бэкенде через Pillow — точнее и без потери качества.

### 3.3 ResizeCropControls

```
[ Ресайз ]
Ширина: [800  ] Высота: [600  ] [✓ Сохранять пропорции]
[Применить к превью]

[ Обрезка ]
[Включить обрезку]  — активирует режим crop в canvas
X: [0] Y: [0] Ш: [800] В: [600]  — поля синхронизируются с canvas
[Сбросить]
```

### 3.4 QuizOverlayControls

```
[ Подготовка к квизу ]

Фигура:   [■ Прямоугольник ▼]  (или: ● Эллипс)
Цвет:     [███] #1e1e1e         (color picker или HEX инпут)
Прозрачность: [████░] 86%

Превью: показывает canvas в режиме "overlay"

[Переключить: Вопрос ↔ Ответ]   — тоггл для сравнения
```

### 3.5 SaveControls

```
Название: [ Угадай животное          ]   ← default = имя файла без расширения
Формат:   [ JPEG ▼ ]  (JPEG / PNG / WebP)
Папка:    [ C:/Quiz           ] [📂]     ← можно изменить
          [           💾 Сохранить вопрос и ответ           ]
```

При нажатии кнопки:
1. POST `/images/save-quiz-pair` с параметрами resize, crop, overlay, custom_name, output_format, output_dir
2. На успех — уведомление с именами сохранённых файлов

---

## Этап 4: Интеграция в App.jsx

### Изменения в левой панели

```jsx
// Добавить третью вкладку
{[["search", "🔍 Поиск"], ["url", "🔗 Ссылка"], ["images", "🖼 Фото"]].map(...)}

// В блоке leftTab === "images" — компонент ImageLibrary
{leftTab === "images" && (
  <ImageLibrary
    imagesDir={imagesDir}
    imageFiles={imageFiles}
    selectedImage={selectedImage}
    onSelectImage={setSelectedImage}
    onDeleteImage={handleDeleteImage}
    onDirChange={handleImagesDirChange}
    onRefresh={fetchImageFiles}
  />
)}
```

### Изменения в правой панели

```jsx
// Добавить условие для imageEditor
{selectedImage ? (
  <ImageEditor
    image={selectedImage}
    imagesDir={imagesDir}
    onClose={() => setSelectedImage(null)}
  />
) : currentTrack ? (
  // ... существующий аудио-редактор
) : previewVideo ? (
  // ... превью YouTube
) : (
  // ... заглушка
)}
```

---

## Этап 5: Детали UX — автокопирование в преднастроенную папку

Когда пользователь перетаскивает файл из системы (не из превью-панели):
1. Frontend получает файл через `event.dataTransfer.files[0]`
2. POST `/images/upload` — multipart form с файлом
3. Бэкенд копирует в `images_dir`, возвращает `{ filename, already_existed }`
4. Frontend рефрешит список файлов: GET `/images/`

Когда пользователь выбирает из превью-панели:
- Файл уже в папке, просто устанавливаем selectedImage — никакого копирования не нужно

---

## Этап 6: Файловая структура после реализации

```
backend/app/api/
├── audio.py          (существующий)
├── download.py       (существующий)
├── export.py         (существующий)
├── search.py         (существующий)
├── tracks.py         (существующий)
└── images.py         ← НОВЫЙ

backend/app/services/
├── downloader.py     (существующий)
├── exporter.py       (существующий)
├── storage.py        (существующий)
└── image_processor.py  ← НОВЫЙ (Pillow-логика)

backend/
└── images_config.json  ← НОВЫЙ (конфиг папки)

frontend/src/
├── App.jsx           (изменить: добавить вкладку + state)
├── ImageEditor.jsx   ← НОВЫЙ (весь редактор)
├── ImageLibrary.jsx  ← НОВЫЙ (левая панель для фото)
└── index.css         (добавить стили для canvas и drag-drop)
```

---

## Последовательность реализации

### Шаг 1 (Backend, ~1 час)
- Создать `image_processor.py` с функциями resize, crop, apply_overlay, save_pair
- Создать `images.py` роутер со всеми эндпоинтами
- Добавить роутер в `main.py`
- Добавить Pillow в `requirements.txt`
- Тест: curl проверка всех эндпоинтов

### Шаг 2 (Frontend — ImageLibrary, ~45 мин)
- Создать `ImageLibrary.jsx`: список превью + кнопка удаления + поле пути + кнопка обзора
- Интегрировать в App.jsx как третью вкладку
- Подключить к GET /images/ и DELETE /images/{filename}

### Шаг 3 (Frontend — DropZone + базовый ImageEditor, ~1 час)
- Создать `ImageEditor.jsx` с DropZone
- Отображение выбранного изображения в `<img>` (без canvas пока)
- Подключить POST /images/upload

### Шаг 4 (Frontend — Canvas + Crop, ~1.5 часа)
- Реализовать canvas с отображением изображения
- Режим "crop": прямоугольник выделения с 8 ручками
- Синхронизация числовых инпутов с позицией прямоугольника

### Шаг 5 (Frontend — Overlay, ~1 час)
- Режим "overlay": тёмная draggable/resizable фигура
- Переключатель форм (прямоугольник / эллипс)
- Контролы цвета и прозрачности
- Тоггл Вопрос ↔ Ответ для сравнения

### Шаг 6 (Frontend — SaveControls + интеграция, ~45 мин)
- Поле имени, выбор формата, выбор папки сохранения
- POST /images/save-quiz-pair → уведомление об успехе
- Финальная проверка всего флоу

---

## Технические решения и обоснования

| Решение | Альтернатива | Почему выбрано |
|---------|-------------|----------------|
| Pillow на бэкенде для финальной обработки | Canvas toBlob на фронте | Pillow точнее, поддерживает WebP, не теряет качество |
| HTML Canvas для интерактивного кропа/оверлея | react-image-crop / konva.js | Нет новых зависимостей, полный контроль над рендером |
| Base64 превью из /images/process | Временный файл на диске | Чище, не засоряет папку промежуточными файлами |
| JSON-конфиг для пути папки | env-переменная / localStorage | Перезапуск сервера сохраняет настройку, не нужен .env |
| Отдельные .jsx файлы для ImageEditor/ImageLibrary | Всё в App.jsx | App.jsx уже ~600 строк, разделение упрощает поддержку |

---

## Потенциальные сложности

1. **Canvas DPI на Retina-дисплеях** — нужно умножать размеры canvas на `devicePixelRatio` и масштабировать контекст, иначе изображение будет мыльным.

2. **Сохранение пропорций при ресайзе** — если пользователь задаёт только ширину, высота вычисляется автоматически. Нужно блокировать поле высоты пока включён чекбокс "сохранять пропорции".

3. **WebP на Windows** — Pillow поддерживает WebP, но на некоторых системах нужна дополнительная библиотека `libwebp`. Нужно обработать ошибку и показать понятное сообщение.

4. **Путь к папке на Windows** — бэкенд принимает Windows-пути (с обратными слэшами), нужно использовать `pathlib.Path` который корректно обрабатывает оба формата.

5. **Большие изображения в canvas** — для файлов >4000px canvas-рендер может тормозить. Решение: отображать в canvas масштабированную версию (max 1200px по длинной стороне), а финальную обработку делать на бэкенде с оригиналом.
