import os
import sys
import asyncio
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional
import yt_dlp
import shutil

DOWNLOAD_DIR = Path("C:/Users/e-kru/quiz-media-tool/backend/downloads")
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

SUPPORTED_BROWSERS = ("chrome", "firefox", "edge", "opera", "brave", "vivaldi", "safari")
SUPPORTED_TYPES = ("audio", "video", "ogg", "ogv")

async def download_youtube_video(url: str, download_type: str = "audio", cookies_from_browser: Optional[str] = None) -> Dict[str, Any]:
    if download_type not in SUPPORTED_TYPES:
        raise ValueError(f"download_type должен быть одним из: {', '.join(SUPPORTED_TYPES)}")

    # Проверка FFmpeg для аудио и видео
    if download_type in ["audio", "video"]:
        if not shutil.which('ffmpeg'):
            return {"error": True, "message": "FFmpeg не установлен в системе"}

    outtmpl_path = str(DOWNLOAD_DIR / '%(title)s.%(ext)s')

    ydl_opts = {
        'outtmpl': outtmpl_path,
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
    }

    # Подключаем cookies из браузера, если указан
    if cookies_from_browser:
        browser = cookies_from_browser.lower()
        if browser not in SUPPORTED_BROWSERS:
            raise ValueError(f"Браузер '{browser}' не поддерживается. Доступные: {', '.join(SUPPORTED_BROWSERS)}")
        ydl_opts['cookiesfrombrowser'] = (browser,)
    
    if download_type == "audio":
        ydl_opts.update({
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        })
    elif download_type == "ogg":
        # OGG Vorbis — лучший формат для LibreOffice (аудио)
        ydl_opts.update({
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'vorbis',
                'preferredquality': '5',
            }],
        })
    elif download_type == "ogv":
        # OGV (Theora+Vorbis) — лучший формат для LibreOffice (видео)
        ydl_opts.update({
            'format': 'bestvideo+bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegVideoConvertor',
                'preferedformat': 'ogv',
            }],
        })
    else:  # video / mp4
        ydl_opts.update({
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'merge_output_format': 'mp4',
        })
    
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    def _download():
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                
                if info is None:
                    raise Exception("Не удалось получить информацию о видео")
                
                # Получаем финальное имя файла
                ext_map = {"audio": ".mp3", "ogg": ".ogg", "ogv": ".ogv"}
                base_filename = ydl.prepare_filename(info)
                stem = Path(base_filename).stem

                if download_type in ext_map:
                    final_path = DOWNLOAD_DIR / (stem + ext_map[download_type])
                else:  # video / mp4
                    final_path = Path(base_filename)
                    if final_path.suffix != '.mp4':
                        for candidate in [final_path.with_suffix('.mp4'), DOWNLOAD_DIR / f"{stem}.mp4"]:
                            if candidate.exists():
                                final_path = candidate
                                break
                
                if not final_path.exists():
                    raise Exception("Файл не был создан")

                # Для MP4-видео переносим moov atom в начало файла (faststart),
                # иначе браузер не может seek до полной загрузки файла.
                if download_type == "video" and final_path.suffix.lower() == ".mp4":
                    tmp_path = final_path.with_name(final_path.stem + "__fs_tmp.mp4")
                    try:
                        fs_result = subprocess.run(
                            ["ffmpeg", "-y", "-loglevel", "error",
                             "-i", str(final_path),
                             "-c", "copy", "-movflags", "+faststart",
                             str(tmp_path)],
                            capture_output=True,
                        )
                        if fs_result.returncode == 0 and tmp_path.exists():
                            final_path.unlink()
                            tmp_path.rename(final_path)
                        elif tmp_path.exists():
                            tmp_path.unlink()
                    except Exception:
                        if tmp_path.exists():
                            tmp_path.unlink()

                return {
                    "title": info.get('title', 'Unknown Title'),
                    "filename": final_path.name,
                    "type": download_type,
                    "path": str(final_path)
                }
        except Exception as e:
            raise Exception(f"Ошибка загрузки: {str(e)}")
    
    return await loop.run_in_executor(None, _download)


async def download_spotify_track(url: str) -> Dict[str, Any]:
    """Скачивает трек со Spotify через spotdl (аудио ищется на YouTube, всегда MP3)."""
    before = set(DOWNLOAD_DIR.glob("*.mp3"))

    cmd = [
        sys.executable, '-m', 'spotdl', 'download', url,
        '--output', str(DOWNLOAD_DIR),
        '--format', 'mp3',
        '--bitrate', '192k',
        '--log-level', 'ERROR',
    ]

    # Опциональные Spotify credentials для надёжности (можно задать в переменных среды)
    client_id = os.environ.get('SPOTIFY_CLIENT_ID')
    client_secret = os.environ.get('SPOTIFY_CLIENT_SECRET')
    if client_id and client_secret:
        cmd += ['--client-id', client_id, '--client-secret', client_secret]

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    def _download():
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)

            after = set(DOWNLOAD_DIR.glob("*.mp3"))
            new_files = after - before

            if not new_files:
                # Фильтруем шум из вывода, оставляем только ошибки
                raw = (proc.stderr or proc.stdout or "").strip()
                lines = [l for l in raw.splitlines() if l.strip()
                         and not any(w in l for w in ('INFO', 'WARNING', 'Downloaded'))]
                error_msg = ' | '.join(lines[:3]) if lines else "Файл не создан. Проверьте ссылку."
                raise Exception(f"Spotify: {error_msg[:300]}")

            final_path = max(new_files, key=lambda p: p.stat().st_mtime)
            return {
                "title": final_path.stem,
                "filename": final_path.name,
                "type": "audio",
                "path": str(final_path),
            }
        except subprocess.TimeoutExpired:
            raise Exception("Время ожидания истекло (3 мин). Попробуйте ещё раз.")
        except FileNotFoundError:
            raise Exception(f"Python не найден по пути: {sys.executable}")

    return await loop.run_in_executor(None, _download)


# Для обратной совместимости со старым кодом
async def download_audio(url: str) -> Dict[str, Any]:
    """Устаревшая функция, используйте download_youtube_video(url, 'audio')"""
    return await download_youtube_video(url, "audio")

async def download_video(url: str) -> Dict[str, Any]:
    """Устаревшая функция, используйте download_youtube_video(url, 'video')"""
    return await download_youtube_video(url, "video")