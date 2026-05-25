from fastapi import APIRouter
from pydantic import BaseModel, Field, validator
from typing import List
from app.services.converter import convert_file, FORMAT_PRESETS
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class ConvertRequest(BaseModel):
    filenames: List[str] = Field(..., min_items=1, max_items=50, description="Имена файлов в папке downloads")
    target_format: str = Field(..., description=f"Целевой формат: {', '.join(FORMAT_PRESETS)}")

    @validator('target_format')
    def validate_format(cls, v):
        if v.lower() not in FORMAT_PRESETS:
            raise ValueError(
                f"Формат '{v}' не поддерживается. Доступные: {', '.join(FORMAT_PRESETS)}"
            )
        return v.lower()


class ConvertResponse(BaseModel):
    status: str
    converted: List[dict]
    failed: List[dict]


@router.post("/", response_model=ConvertResponse)
async def convert_files(req: ConvertRequest):
    """
    Конвертирует уже скачанные файлы в нужный формат.
    Особенно полезно для LibreOffice: используйте target_format=ogg (аудио) или ogv (видео).
    """
    successful = []
    failed = []

    for filename in req.filenames:
        try:
            result = await convert_file(filename, req.target_format)
            successful.append({"filename": filename, "status": "success", **result})
        except Exception as e:
            logger.error(f"Ошибка конвертации {filename}: {e}")
            failed.append({"filename": filename, "status": "error", "detail": str(e)})

    return ConvertResponse(status="completed", converted=successful, failed=failed)
