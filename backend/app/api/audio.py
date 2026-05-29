from pathlib import Path
from typing import Generator
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

router = APIRouter()

# Путь к папке загрузок
DOWNLOAD_DIR = Path("C:/Users/e-kru/quiz-media-tool/backend/downloads")

CHUNK_SIZE = 1024 * 1024  # 1 МБ — достаточно для первой отдачи moov atom


def _stream_file(file_path: Path, start: int, end: int) -> Generator[bytes, None, None]:
    """Отдаёт файл потоком в чанках. Браузер получает первые байты (включая moov)
    немедленно, не дожидаясь чтения всего файла в память."""
    with open(file_path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = f.read(min(CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk

@router.get("/audio/{filename:path}")
def get_audio(filename: str, request: Request):
    # Безопасно склеиваем абсолютный путь с именем файла
    file_path = DOWNLOAD_DIR / filename
    
    # Проверяем физическое существование файла на диске
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=404, 
            detail=f"Файл не найден на сервере. Проверен путь: {file_path}"
        )
    
    # Определяем MIME тип на основе расширения
    suffix = file_path.suffix.lower()
    if suffix == '.mp3':
        media_type = "audio/mpeg"
    elif suffix == '.mp4':
        media_type = "video/mp4"
    elif suffix == '.webm':
        media_type = "video/webm"
    elif suffix == '.ogg':
        media_type = "audio/ogg"
    elif suffix == '.ogv':
        media_type = "video/ogg"
    elif suffix == '.wav':
        media_type = "audio/wav"
    else:
        media_type = None  # Пусть FastAPI определит сам
        
    range_header = request.headers.get("range")
    if range_header:
        try:
            units, value = range_header.split("=", 1)
            if units.strip().lower() != "bytes":
                raise ValueError()
            
            start_text, end_text = value.split("-", 1)
            file_size = file_path.stat().st_size
            start = int(start_text) if start_text else 0
            end = int(end_text) if end_text else file_size - 1
            end = min(end, file_size - 1)
            
            if start < 0 or start >= file_size or end < start:
                return Response(
                    status_code=416,
                    headers={
                        "Accept-Ranges": "bytes",
                        "Content-Range": f"bytes */{file_size}",
                    },
                )
                
            headers = {
                "Accept-Ranges": "bytes",
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(end - start + 1),  # явный размер → без chunked encoding
                "Content-Disposition": "inline",
                "Cache-Control": "no-cache, no-store",
            }

            # StreamingResponse с явным Content-Length.
            # Браузер знает полный размер ответа (не chunked) и может seekать,
            # а данные отдаются потоком — браузер получает moov atom из первого
            # чанка (~1 МБ) немедленно, не дожидаясь чтения всего файла.
            return StreamingResponse(
                _stream_file(file_path, start, end),
                status_code=206,
                media_type=media_type,
                headers=headers,
            )
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid Range header")
            
    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Disposition": "inline",
            "Cache-Control": "no-cache, no-store",
        },
    )
