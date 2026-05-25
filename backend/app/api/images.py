"""
API для работы с изображениями.
"""

import logging
import shutil
import threading
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.services.image_processor import (
    SUPPORTED_EXTENSIONS,
    get_images_dir,
    list_images,
    load_config,
    process_preview,
    save_config,
    save_quiz_pair,
    save_single,
    set_images_dir,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Схемы ───────────────────────────────────────────────────────────────────

class ResizeParams(BaseModel):
    width: Optional[int] = None
    height: Optional[int] = None
    keep_aspect: bool = True


class CropParams(BaseModel):
    x: int = 0
    y: int = 0
    width: int
    height: int


class OverlayParams(BaseModel):
    shape: str = "rectangle"
    x: int = 0
    y: int = 0
    width: int
    height: int
    color: list[int] = [20, 20, 20]
    opacity: int = 230
    angle: float = 0


class ProcessRequest(BaseModel):
    filename: str
    resize: Optional[ResizeParams] = None
    crop: Optional[CropParams] = None


class SaveQuizPairRequest(BaseModel):
    filename: str
    custom_name: str
    output_format: str = "jpg"
    output_dir: str
    resize: Optional[ResizeParams] = None
    crop: Optional[CropParams] = None
    overlays: Optional[list[OverlayParams]] = None  # список фигур


class SaveSingleRequest(BaseModel):
    filename: str
    custom_name: str
    output_format: str = "jpg"
    output_dir: str
    resize: Optional[ResizeParams] = None
    crop: Optional[CropParams] = None


class SettingsRequest(BaseModel):
    images_dir: str


# ─── Эндпоинты ───────────────────────────────────────────────────────────────

@router.get("/pick-folder")
async def pick_folder():
    try:
        import tkinter as tk
        from tkinter import filedialog
        result = {"path": ""}
        def _open_dialog():
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            path = filedialog.askdirectory(title="Выбрать папку")
            result["path"] = path or ""
            root.destroy()
        t = threading.Thread(target=_open_dialog, daemon=True)
        t.start()
        t.join(timeout=60)
        return {"path": result["path"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось открыть диалог: {e}")


@router.get("/")
async def get_images():
    images_dir = get_images_dir()
    files = list_images(images_dir)
    return {"files": files, "images_dir": str(images_dir)}


@router.get("/settings")
async def get_settings():
    config = load_config()
    images_dir = get_images_dir()
    return {"images_dir": config.get("images_dir", str(images_dir))}


@router.post("/settings")
async def update_settings(body: SettingsRequest):
    try:
        new_dir = set_images_dir(body.images_dir)
        return {"images_dir": str(new_dir), "status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Не удалось установить папку: {e}")


@router.get("/file/{filename:path}")
async def get_image_file(filename: str):
    images_dir = get_images_dir()
    file_path = images_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")
    if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Неподдерживаемый формат")
    return FileResponse(str(file_path))


@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Имя файла не указано")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Неподдерживаемый формат '{suffix}'")
    images_dir = get_images_dir()
    dest = images_dir / file.filename
    already_existed = dest.exists()
    if not already_existed:
        try:
            with open(dest, "wb") as f:
                shutil.copyfileobj(file.file, f)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка сохранения: {e}")
    return {"filename": file.filename, "already_existed": already_existed, "status": "ok"}


@router.delete("/{filename:path}")
async def delete_image(filename: str):
    images_dir = get_images_dir()
    file_path = images_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")
    try:
        file_path.unlink()
        return {"status": "deleted", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка удаления: {e}")


@router.post("/process")
async def process_image(body: ProcessRequest):
    images_dir = get_images_dir()
    try:
        result = process_preview(
            images_dir=images_dir,
            filename=body.filename,
            resize=body.resize.model_dump() if body.resize else None,
            crop=body.crop.model_dump() if body.crop else None,
        )
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка обработки: {e}")


@router.post("/save-quiz-pair")
async def save_quiz_pair_endpoint(body: SaveQuizPairRequest):
    images_dir = get_images_dir()
    try:
        overlays_data = [o.model_dump() for o in body.overlays] if body.overlays else None
        result = save_quiz_pair(
            images_dir=images_dir,
            filename=body.filename,
            custom_name=body.custom_name,
            output_format=body.output_format,
            output_dir=body.output_dir,
            resize=body.resize.model_dump() if body.resize else None,
            crop=body.crop.model_dump() if body.crop else None,
            overlays=overlays_data,
        )
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка сохранения: {e}")


@router.post("/save-single")
async def save_single_endpoint(body: SaveSingleRequest):
    images_dir = get_images_dir()
    try:
        result = save_single(
            images_dir=images_dir,
            filename=body.filename,
            custom_name=body.custom_name,
            output_format=body.output_format,
            output_dir=body.output_dir,
            resize=body.resize.model_dump() if body.resize else None,
            crop=body.crop.model_dump() if body.crop else None,
        )
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка сохранения: {e}")
