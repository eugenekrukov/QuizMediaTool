from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from app.services.downloader import download_youtube_video, download_spotify_track
import logging
from urllib.parse import urlparse

logger = logging.getLogger(__name__)
router = APIRouter()

class DownloadRequest(BaseModel):
    urls: List[str] = Field(..., min_items=1, max_items=50)
    download_type: str = Field(default="audio", description="Тип загрузки: 'audio' или 'video'")
    cookies_from_browser: Optional[str] = Field(
        default=None,
        description="Браузер для получения cookies: chrome, firefox, edge, opera, brave, vivaldi, safari"
    )

    @validator('urls')
    def validate_urls(cls, v):
        validated = []
        for url in v:
            clean_url = url.strip()
            if clean_url:
                is_youtube = 'youtube.com' in clean_url or 'youtu.be' in clean_url
                is_spotify = 'open.spotify.com/track/' in clean_url
                if is_youtube or is_spotify:
                    validated.append(clean_url)
                else:
                    raise ValueError(f"Неверный URL: {clean_url}. Поддерживаются YouTube и Spotify ссылки")
        return validated

    @validator('download_type')
    def validate_download_type(cls, v):
        from app.services.downloader import SUPPORTED_TYPES
        if v not in SUPPORTED_TYPES:
            raise ValueError(f"download_type должен быть одним из: {', '.join(SUPPORTED_TYPES)}")
        return v

    @validator('cookies_from_browser')
    def validate_browser(cls, v):
        if v is not None:
            from app.services.downloader import SUPPORTED_BROWSERS
            if v.lower() not in SUPPORTED_BROWSERS:
                raise ValueError(f"Браузер '{v}' не поддерживается. Доступные: {', '.join(SUPPORTED_BROWSERS)}")
        return v

class DownloadResponse(BaseModel):
    status: str
    downloaded: List[dict]
    failed: List[dict]

@router.post("/", response_model=DownloadResponse)  # Обратите внимание: путь "/", не "/download/"
async def download_multiple_tracks(req: DownloadRequest):
    successful_downloads = []
    failed_downloads = []

    for url in req.urls:
        try:
            if 'open.spotify.com/track/' in url:
                result = await download_spotify_track(url)
            else:
                result = await download_youtube_video(url, req.download_type, req.cookies_from_browser)
            successful_downloads.append({
                "url": url,
                "status": "success",
                "title": result.get("title", "Unknown"),
                "filename": result.get("filename", ""),
                "type": result.get("type", req.download_type)
            })
        except Exception as e:
            logger.error(f"Ошибка скачивания {url}: {str(e)}")
            failed_downloads.append({
                "url": url,
                "status": "error",
                "detail": str(e)
            })

    return DownloadResponse(
        status="completed",
        downloaded=successful_downloads,
        failed=failed_downloads
    )