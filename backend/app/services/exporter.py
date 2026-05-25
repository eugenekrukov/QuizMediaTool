import subprocess
import os

DOWNLOAD_DIR = "downloads"
EXPORT_DIR = "exports"

# Этот модуль не используется — экспорт реализован напрямую в app/api/export.py
def export_clip(file: str, start: float, end: float, output_name: str):
    os.makedirs(EXPORT_DIR, exist_ok=True)

    input_path = os.path.join(DOWNLOAD_DIR, file)
    output_path = os.path.join(EXPORT_DIR, f"{output_name}.mp3")
    duration = end - start

    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(start),
        "-i", input_path,
        "-t", str(duration),
        "-vn",
        "-c:a", "libmp3lame",
        "-q:a", "2",
        output_path
    ]

    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    return output_path
