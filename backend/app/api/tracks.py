from fastapi import APIRouter, HTTPException, BackgroundTasks
from pathlib import Path
from typing import List
import subprocess
import shutil
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

DOWNLOAD_DIR = Path("C:/Users/e-kru/quiz-media-tool/backend/downloads")
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_mp4_faststart(video_path: Path) -> None:
    """Перемещает moov atom в начало MP4 (faststart), если ещё не сделано.
    Без этого браузер не может seekать видео до полной загрузки файла.
    Операция идемпотентна: если moov уже в начале — ffmpeg завершается быстро."""
    if video_path.suffix.lower() != ".mp4":
        return
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        return
    tmp_path = video_path.with_name(video_path.stem + "__fs_tmp.mp4")
    try:
        result = subprocess.run(
            [ffmpeg_path, "-y", "-loglevel", "error",
             "-i", str(video_path),
             "-c", "copy", "-movflags", "+faststart",
             str(tmp_path)],
            capture_output=True,
        )
        if result.returncode == 0 and tmp_path.exists() and tmp_path.stat().st_size > 0:
            video_path.unlink()
            tmp_path.rename(video_path)
            logger.info(f"faststart applied: {video_path.name}")
        elif tmp_path.exists():
            tmp_path.unlink()
    except Exception as e:
        logger.warning(f"faststart failed for {video_path.name}: {e}")
        if tmp_path.exists():
            tmp_path.unlink()

@router.get("/")
async def get_tracks():
    """Получить список всех треков (аудио и видео)"""
    try:
        extensions = ['.mp3', '.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4a', '.wav', '.ogg', '.ogv']
        tracks = []
        
        for ext in extensions:
            tracks.extend(DOWNLOAD_DIR.glob(f"*{ext}"))
        
        tracks = sorted(tracks, key=lambda x: x.stat().st_mtime, reverse=True)
        track_names = [t.name for t in tracks]
        
        logger.info(f"Найдено файлов: {len(track_names)}")
        return {"tracks": track_names}
    except Exception as e:
        logger.error(f"Ошибка: {e}")
        return {"tracks": []}

@router.delete("/{track_name:path}")
async def delete_track(track_name: str):
    """Удалить трек"""
    try:
        file_path = DOWNLOAD_DIR / track_name
        if file_path.exists():
            file_path.unlink()
            logger.info(f"Удален: {track_name}")
            return {"status": "deleted"}
        raise HTTPException(status_code=404, detail="Файл не найден")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/convert-to-audio/{filename:path}")
async def convert_to_audio(filename: str):
    """Конвертирует видео в аудио для работы с WaveSurfer"""
    video_path = DOWNLOAD_DIR / filename
    
    logger.info(f"POST запрос конвертации: {filename}")
    logger.info(f"Полный путь к видео: {video_path}")
    
    if not video_path.exists():
        logger.error(f"Файл не найден: {video_path}")
        raise HTTPException(status_code=404, detail=f"Файл не найден: {filename}")
    
    # Проверяем, что это видеофайл
    video_extensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov']
    if video_path.suffix.lower() not in video_extensions:
        raise HTTPException(status_code=400, detail=f"Файл не является видео: {video_path.suffix}")
    
    # Создаем имя для аудио файла
    audio_filename = video_path.stem + '.mp3'
    audio_path = DOWNLOAD_DIR / audio_filename
    
    # Если аудио уже существует, просто возвращаем его
    if audio_path.exists():
        logger.info(f"Аудио уже существует: {audio_filename}")
        # На случай если исходное видео скачано без faststart — применяем его.
        # Это исправляет seek для уже существующих файлов при первом открытии.
        _ensure_mp4_faststart(video_path)
        return {"status": "exists", "audio_file": audio_filename}
    
    # Проверяем наличие ffmpeg
    ffmpeg_path = shutil.which('ffmpeg')
    if not ffmpeg_path:
        logger.error("FFmpeg не найден в системе")
        raise HTTPException(status_code=500, detail="FFmpeg не установлен. Установите FFmpeg для конвертации видео.")
    
    logger.info(f"FFmpeg найден: {ffmpeg_path}")
    
    # Конвертируем видео в аудио
    try:
        cmd = [
            ffmpeg_path,
            '-i', str(video_path),
            '-vn',
            '-acodec', 'libmp3lame',
            '-ab', '192k',
            '-ar', '44100',
            '-y',
            str(audio_path)
        ]
        
        logger.info(f"Запуск FFmpeg: {' '.join(cmd)}")
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            logger.error(f"FFmpeg ошибка (код {result.returncode}): {result.stderr}")
            raise Exception(f"FFmpeg ошибка: {result.stderr[:500]}")
        
        if audio_path.exists() and audio_path.stat().st_size > 0:
            logger.info(f"Конвертация успешна! Размер: {audio_path.stat().st_size} bytes")
            # Попутно чиним faststart у исходного видео
            _ensure_mp4_faststart(video_path)
            return {"status": "converted", "audio_file": audio_filename}
        else:
            raise Exception("Аудио файл не был создан или имеет нулевой размер")
            
    except subprocess.TimeoutExpired:
        logger.error("Превышено время конвертации (5 минут)")
        raise HTTPException(status_code=500, detail="Превышено время конвертации")
    except Exception as e:
        logger.error(f"Ошибка конвертации: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка конвертации: {str(e)}")