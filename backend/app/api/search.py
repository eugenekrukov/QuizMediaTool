import asyncio
import base64
import os
import urllib.request
import urllib.parse
import json
from fastapi import APIRouter, HTTPException
import yt_dlp

router = APIRouter()


def _do_search(query: str, limit: int) -> list:
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "skip_download": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        raw = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)

    entries = (raw or {}).get("entries", [])
    results = []
    for e in entries:
        if not e:
            continue
        vid_id = e.get("id", "")
        duration = e.get("duration")  # секунды, может быть None
        results.append({
            "id": vid_id,
            "title": e.get("title", ""),
            "url": f"https://www.youtube.com/watch?v={vid_id}",
            "duration": duration,
            "thumbnail": f"https://img.youtube.com/vi/{vid_id}/mqdefault.jpg",
            "channel": e.get("uploader") or e.get("channel") or "",
            "view_count": e.get("view_count"),
        })
    return results


@router.get("/")
async def search_youtube(q: str, limit: int = 12):
    if not q.strip():
        raise HTTPException(status_code=400, detail="Пустой поисковый запрос")
    if limit < 1 or limit > 25:
        limit = 12

    try:
        loop = asyncio.get_running_loop()
        results = await loop.run_in_executor(None, _do_search, q.strip(), limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка поиска: {str(e)}")

    return {"results": results}


# ── Spotify search ────────────────────────────────────────────────────────────

def _get_spotify_token(client_id: str, client_secret: str) -> str:
    """Получает Bearer-токен через Spotify client credentials flow."""
    credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    data = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
    req = urllib.request.Request(
        "https://accounts.spotify.com/api/token",
        data=data,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())["access_token"]


def _do_spotify_search(query: str, limit: int, client_id: str, client_secret: str) -> list:
    token = _get_spotify_token(client_id, client_secret)

    params = urllib.parse.urlencode({"q": query, "type": "track", "limit": limit})
    req = urllib.request.Request(
        f"https://api.spotify.com/v1/search?{params}",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())

    results = []
    for t in data.get("tracks", {}).get("items", []) or []:
        images = t.get("album", {}).get("images", [])
        # Берём среднее изображение (300×300), иначе первое
        thumbnail = images[1]["url"] if len(images) > 1 else (images[0]["url"] if images else "")
        results.append({
            "id": t["id"],
            "title": t["name"],
            "artists": ", ".join(a["name"] for a in t.get("artists", [])),
            "album": t.get("album", {}).get("name", ""),
            "thumbnail": thumbnail,
            "duration": t["duration_ms"] // 1000,
            "url": t["external_urls"]["spotify"],
            "preview_url": t.get("preview_url"),
        })
    return results


@router.get("/spotify")
async def search_spotify(q: str, limit: int = 12):
    if not q.strip():
        raise HTTPException(status_code=400, detail="Пустой поисковый запрос")
    if limit < 1 or limit > 25:
        limit = 12

    client_id = os.environ.get("SPOTIFY_CLIENT_ID", "").strip()
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "").strip()

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=503,
            detail=(
                "Для поиска по Spotify нужны API-ключи. "
                "Зарегистрируйте бесплатное приложение на developer.spotify.com, "
                "затем задайте переменные среды SPOTIFY_CLIENT_ID и SPOTIFY_CLIENT_SECRET."
            ),
        )

    try:
        loop = asyncio.get_running_loop()
        results = await loop.run_in_executor(
            None, _do_spotify_search, q.strip(), limit, client_id, client_secret
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка поиска Spotify: {str(e)}")

    return {"results": results}
