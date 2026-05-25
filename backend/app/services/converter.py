import asyncio
import subprocess
import shutil
from pathlib import Path
from typing import Dict, Any

DOWNLOAD_DIR = Path("C:/Users/e-kru/quiz-media-tool/backend/downloads")

# Поддерживаемые целевые форматы и соответствующие кодеки FFmpeg
FORMAT_PRESETS: Dict[str, Dict] = {
    "ogg":  {"ext": ".ogg", "args": ["-c:a", "libvorbis", "-q:a", "5"]},
    "ogv":  {"ext": ".ogv", "args": ["-c:v", "libtheora", "-q:v", "7", "-c:a", "libvorbis", "-q:a", "5"]},
    "mp3":  {"ext": ".mp3", "args": ["-c:a", "libmp3lame", "-b:a", "192k"]},
    "mp4":  {"ext": ".mp4", "args": ["-c:v", "libx264", "-c:a", "aac", "-b:a", "192k"]},
    "wav":  {"ext": ".wav", "args": ["-c:a", "pcm_s16le"]},
    "webm": {"ext": ".webm", "args": ["-c:v", "libvpx-vp9", "-c:a", "libvorbis"]},
}


async def convert_file(filename: str, target_format: str) -> Dict[str, Any]:
    """Конвертирует уже скачанный файл в нужный формат через FFmpeg."""

    if not shutil.which('ffmpeg'):
        raise RuntimeError("FFmpeg не найден в системе")

    target_format = target_format.lower()
    if target_format not in FORMAT_PRESETS:
        raise ValueError(
            f"Формат '{target_format}' не поддерживается. "
            f"Доступные: {', '.join(FORMAT_PRESETS)}"
        )

    src_path = DOWNLOAD_DIR / filename
    if not src_path.exists():
        raise FileNotFoundError(f"Файл не найден: {filename}")

    preset = FORMAT_PRESETS[target_format]
    dst_path = src_path.with_suffix(preset["ext"])

    # Если исходный и целевой файлы совпадают — ничего не делаем
    if src_path.resolve() == dst_path.resolve():
        return {
            "filename": dst_path.name,
            "path": str(dst_path),
            "format": target_format,
            "converted": False,
            "message": "Файл уже в нужном формате",
        }

    cmd = ["ffmpeg", "-y", "-i", str(src_path)] + preset["args"] + [str(dst_path)]

    def _run():
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if result.returncode != 0:
            error_output = result.stderr.decode(errors="replace")
            raise RuntimeError(f"FFmpeg завершился с ошибкой:\n{error_output}")

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _run)

    return {
        "filename": dst_path.name,
        "path": str(dst_path),
        "format": target_format,
        "converted": True,
        "source": filename,
    }
