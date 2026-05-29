import os
import subprocess
from pathlib import Path
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Абсолютный путь к директории загрузок и результирующей папке Quiz
DOWNLOAD_DIR = Path(r"C:\Users\e-kru\quiz-media-tool\backend\downloads")
QUIZ_OUTPUT_DIR = DOWNLOAD_DIR / "Quiz"

class RegionModel(BaseModel):
    id: str
    track_name: str  # Фронтенд теперь передает имя трека внутри каждого объекта
    start: float
    end: float
    type: str        # "question" или "answer"
    label: str

class ExportPayload(BaseModel):
    segments: List[RegionModel]  # Принимаем плоский список segments, как отправляет фронтенд

def sanitize_filename(name: str) -> str:
    """Удаляет символы, которые запрещены в именах файлов Windows."""
    return "".join(c for c in name if c.isalnum() or c in "._- ").strip()

@router.post("/")
async def export_quiz(payload: ExportPayload):
    try:
        # Создаем папку Quiz внутри downloads, если её ещё нет
        QUIZ_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        
        sliced_count = 0
        skipped_count = 0

        for region in payload.segments:
            source_file = DOWNLOAD_DIR / region.track_name
            
            if not source_file.exists():
                print(f"❌ Исходный файл не найден: {region.track_name}, пропускаем.")
                skipped_count += 1
                continue
                
            duration = region.end - region.start
            
            # Защита от ошибочных или пустых отрезков
            if duration <= 0:
                continue
            
            label = sanitize_filename(region.label)
            output_ext = source_file.suffix.lower()

            # Формируем имя файла внутри единой папки Quiz
            output_file = QUIZ_OUTPUT_DIR / f"{label}{output_ext}"

            video_exts = {'.mp4', '.webm', '.mkv', '.avi', '.mov'}

            if output_ext in video_exts:
                # Видео: копируем оба потока без перекодирования — мгновенно.
                # Без -c:v ffmpeg использует libx264 medium → десятки минут на длинных файлах.
                command = [
                    "ffmpeg", "-y",
                    "-ss", str(region.start),
                    "-i", str(source_file),
                    "-t", str(duration),
                    "-c", "copy",
                    str(output_file)
                ]
            else:
                # Аудио: перекодируем в MP3 для точной нарезки
                command = [
                    "ffmpeg", "-y",
                    "-ss", str(region.start),
                    "-i", str(source_file),
                    "-t", str(duration),
                    "-vn",
                    "-c:a", "libmp3lame",
                    "-q:a", "2",
                    str(output_file)
                ]

            # Запускаем процесс нарезки
            # Если хотите видеть логи ffmpeg в терминале uvicorn при отладке, 
            # можно временно убрать stdout и stderr параметры
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8")
            
            if result.returncode == 0:
                sliced_count += 1
            else:
                print(f"❌ Ошибка FFmpeg для отрезка {label}: {result.stderr}")

        return {
            "status": "success", 
            "message": f"Готово! Физически нарезано отрезков: {sliced_count}. Пропущено: {skipped_count}. Все файлы сохранены в downloads/Quiz"
        }

    except Exception as e:
        print(f" Глобальная ошибка экспорта: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при генерации аудио: {str(e)}")