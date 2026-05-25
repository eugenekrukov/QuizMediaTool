"""
Сервис обработки изображений на Pillow.
"""

import base64
import io
import json
import logging
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).parent.parent.parent / "images_config.json"
DEFAULT_IMAGES_DIR = Path(__file__).parent.parent.parent.parent / "backend" / "images"

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif"}
SAVE_FORMATS = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"images_dir": str(DEFAULT_IMAGES_DIR)}


def save_config(config: dict):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def get_images_dir() -> Path:
    config = load_config()
    p = Path(config.get("images_dir", str(DEFAULT_IMAGES_DIR)))
    p.mkdir(parents=True, exist_ok=True)
    return p


def set_images_dir(new_path: str) -> Path:
    p = Path(new_path)
    p.mkdir(parents=True, exist_ok=True)
    config = load_config()
    config["images_dir"] = str(p)
    save_config(config)
    return p


def list_images(images_dir: Path) -> list[dict]:
    files = []
    for f in sorted(images_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS:
            files.append({
                "filename": f.name,
                "size": f.stat().st_size,
                "modified": f.stat().st_mtime,
            })
    return files


def _open_image(images_dir: Path, filename: str) -> Image.Image:
    path = images_dir / filename
    if not path.exists():
        raise FileNotFoundError(f"Файл не найден: {filename}")
    return Image.open(path)


def apply_resize(img: Image.Image, width: Optional[int], height: Optional[int], keep_aspect: bool = True) -> Image.Image:
    if not width and not height:
        return img
    orig_w, orig_h = img.size
    if keep_aspect:
        if width and height:
            ratio = min(width / orig_w, height / orig_h)
            new_w = round(orig_w * ratio)
            new_h = round(orig_h * ratio)
        elif width:
            ratio = width / orig_w
            new_w, new_h = width, round(orig_h * ratio)
        else:
            ratio = height / orig_h
            new_w, new_h = round(orig_w * ratio), height
    else:
        new_w = width or orig_w
        new_h = height or orig_h
    return img.resize((new_w, new_h), Image.LANCZOS)


def apply_crop(img: Image.Image, x: int, y: int, width: int, height: int) -> Image.Image:
    img_w, img_h = img.size
    left = max(0, x)
    top = max(0, y)
    right = min(img_w, x + width)
    bottom = min(img_h, y + height)
    return img.crop((left, top, right, bottom))


def apply_overlay(img: Image.Image, overlay: dict) -> Image.Image:
    """Накладывает фигуру (с поддержкой поворота). Возвращает RGBA для возможности chaining."""
    base = img.convert("RGBA")
    overlay_layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay_layer)

    color_rgb = overlay.get("color", [20, 20, 20])
    opacity = overlay.get("opacity", 230)
    color = tuple(color_rgb) + (opacity,)

    x = overlay.get("x", 0)
    y = overlay.get("y", 0)
    w = overlay.get("width", base.size[0])
    h = overlay.get("height", base.size[1])
    shape = overlay.get("shape", "rectangle")
    angle = overlay.get("angle", 0)

    box = [x, y, x + w, y + h]
    if shape == "ellipse":
        draw.ellipse(box, fill=color)
    else:
        draw.rectangle(box, fill=color)

    if angle and angle % 360 != 0:
        cx, cy = x + w // 2, y + h // 2
        overlay_layer = overlay_layer.rotate(-angle, expand=False, center=(cx, cy))

    result = Image.alpha_composite(base, overlay_layer)
    return result  # RGBA


def _img_to_base64(img: Image.Image, fmt: str = "JPEG") -> str:
    buf = io.BytesIO()
    save_img = img.convert("RGB") if fmt == "JPEG" and img.mode == "RGBA" else img
    save_img.save(buf, format=fmt, quality=90)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def process_preview(
    images_dir: Path,
    filename: str,
    resize: Optional[dict] = None,
    crop: Optional[dict] = None,
) -> dict:
    img = _open_image(images_dir, filename)
    if resize:
        img = apply_resize(img, resize.get("width"), resize.get("height"), resize.get("keep_aspect", True))
    if crop:
        img = apply_crop(img, crop["x"], crop["y"], crop["width"], crop["height"])
    return {"base64": _img_to_base64(img), "width": img.size[0], "height": img.size[1]}


def save_quiz_pair(
    images_dir: Path,
    filename: str,
    custom_name: str,
    output_format: str,
    output_dir: str,
    resize: Optional[dict] = None,
    crop: Optional[dict] = None,
    overlays: Optional[list] = None,  # список overlay dict
) -> dict:
    fmt_key = output_format.lower().lstrip(".")
    pil_fmt = SAVE_FORMATS.get(fmt_key, "JPEG")
    ext = "jpg" if pil_fmt == "JPEG" else fmt_key

    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    img = _open_image(images_dir, filename)

    if resize:
        img = apply_resize(img, resize.get("width"), resize.get("height"), resize.get("keep_aspect", True))
    if crop and crop.get("width") and crop.get("height"):
        img = apply_crop(img, crop["x"], crop["y"], crop["width"], crop["height"])

    # Ответ — без оверлея
    answer_name = f"{custom_name} ответ.{ext}"
    answer_path = out_path / answer_name
    answer_img = img.copy()
    if pil_fmt == "JPEG" and answer_img.mode == "RGBA":
        answer_img = answer_img.convert("RGB")
    answer_img.save(answer_path, format=pil_fmt, quality=92)
    logger.info(f"Сохранён ответ: {answer_path}")

    # Вопрос — с оверлеями
    question_img = img.copy()
    if overlays:
        for ovr in overlays:
            if ovr:
                question_img = apply_overlay(question_img, ovr)  # returns RGBA
    if pil_fmt == "JPEG" and question_img.mode == "RGBA":
        question_img = question_img.convert("RGB")
    question_name = f"{custom_name} вопрос.{ext}"
    question_path = out_path / question_name
    question_img.save(question_path, format=pil_fmt, quality=92)
    logger.info(f"Сохранён вопрос: {question_path}")

    return {
        "question_file": question_name,
        "answer_file": answer_name,
        "output_dir": str(out_path),
        "width": img.size[0],
        "height": img.size[1],
    }


def save_single(
    images_dir: Path,
    filename: str,
    custom_name: str,
    output_format: str,
    output_dir: str,
    resize: Optional[dict] = None,
    crop: Optional[dict] = None,
) -> dict:
    fmt_key = output_format.lower().lstrip(".")
    pil_fmt = SAVE_FORMATS.get(fmt_key, "JPEG")
    ext = "jpg" if pil_fmt == "JPEG" else fmt_key

    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    img = _open_image(images_dir, filename)
    if resize:
        img = apply_resize(img, resize.get("width"), resize.get("height"), resize.get("keep_aspect", True))
    if crop and crop.get("width") and crop.get("height"):
        img = apply_crop(img, crop["x"], crop["y"], crop["width"], crop["height"])

    save_img = img.copy()
    if pil_fmt == "JPEG" and save_img.mode == "RGBA":
        save_img = save_img.convert("RGB")

    out_name = f"{custom_name}.{ext}"
    out_file = out_path / out_name
    save_img.save(out_file, format=pil_fmt, quality=92)
    logger.info(f"Сохранено: {out_file}")

    return {"file": out_name, "output_dir": str(out_path), "width": img.size[0], "height": img.size[1]}
