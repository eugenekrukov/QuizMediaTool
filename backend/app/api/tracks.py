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


def _mp4_has_faststart(video_path: Path) -> bool:
    """Возвращает True, если moov atom уже стоит перед mdat (faststart)."""
    try:
        with open(video_path, "rb") as f:
            data = f.read(min(512 * 1024, video_path.stat().st_size))
        pos = 0
        moov_pos = mdat_pos = None
        while pos + 8 <= len(data):
            size = int.from_bytes(data[pos:pos+4], "big")
            name = data[pos+4:pos+8]
            if name == b"moov":
                moov_pos = pos
            elif name == b"mdat":
                mdat_pos = pos
            if size < 8:
                break
            pos += size
        # Если оба найдены в первых 512 КБ — порядок ясен
        if moov_pos is not None and mdat_pos is not None:
            return moov_pos < mdat_pos
        # Если moov найден, а mdat — нет в первых 512 КБ: moov точно в начале
        if moov_pos is not None:
            return True
        return False
    except Exception:
        return False


def _mp4_is_fragmented(video_path: Path) -> bool:
    """Возвращает True, если MP4 является фрагментированным (fMP4/DASH).
    fMP4 содержит box 'mvex' внутри 'moov'. Chrome не может seekать такие файлы
    без SIDX-индекса, поэтому video.seekable.end(0) = 0.

    ВАЖНО: не ограничиваем поиск mvex буфером 512 КБ — у длинных видео moov
    может быть > 1 МБ, и mvex окажется за его пределами. После нахождения moov
    читаем его целиком (до 16 МБ) отдельным seek-ом."""
    try:
        file_size = video_path.stat().st_size
        # Первые 512 КБ — только чтобы найти позицию и размер moov
        with open(video_path, "rb") as f:
            header = f.read(min(512 * 1024, file_size))
        pos = 0
        while pos + 8 <= len(header):
            size = int.from_bytes(header[pos:pos+4], "big")
            name = header[pos+4:pos+8]
            if name == b"moov":
                # Читаем moov целиком (до 16 МБ) начиная с его реальной позиции
                moov_read = min(size, 16 * 1024 * 1024)
                with open(video_path, "rb") as f:
                    f.seek(pos)
                    moov_data = f.read(moov_read)
                inner_pos = 8  # пропускаем заголовок moov
                while inner_pos + 8 <= len(moov_data):
                    inner_size = int.from_bytes(moov_data[inner_pos:inner_pos+4], "big")
                    inner_name = moov_data[inner_pos+4:inner_pos+8]
                    if inner_name == b"mvex":
                        return True
                    if inner_size < 8:
                        break
                    inner_pos += inner_size
                return False  # moov найден, mvex не обнаружен — обычный MP4
            if size < 8:
                break
            pos += size
        return False
    except Exception:
        return False


def _ensure_mp4_faststart(video_path: Path) -> bool:
    """Перемещает moov atom в начало MP4 (faststart) и дефрагментирует fMP4.
    fMP4 (fragmented MP4 от yt-dlp DASH) имеет moov в начале, но Chrome
    не может seekать его (video.seekable.end = 0) без дефрагментации.
    Вызывать ДО того, как браузер откроет файл — иначе на Windows
    unlink() упадёт с PermissionError из-за блокировки.
    Возвращает True, если файл был пересобран."""
    if video_path.suffix.lower() != ".mp4":
        return False
    is_fragmented = _mp4_is_fragmented(video_path)
    if not is_fragmented and _mp4_has_faststart(video_path):
        logger.debug(f"faststart already ok: {video_path.name}")
        return False
    if is_fragmented:
        logger.info(f"fMP4 detected (mvex present), will defragment+faststart: {video_path.name}")
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        return False
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
            # На Windows атомарная замена: replace() работает даже если файл открыт
            # другим процессом (в отличие от unlink+rename)
            tmp_path.replace(video_path)
            action = "defragmented+faststart" if is_fragmented else "faststart"
            logger.info(f"{action} applied: {video_path.name}")
            return True
        elif tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        return False
    except Exception as e:
        logger.warning(f"faststart failed for {video_path.name}: {e}")
        if tmp_path.exists():
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass
        return False

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