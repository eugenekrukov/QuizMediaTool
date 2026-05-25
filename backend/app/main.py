from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.api import download, tracks, export, audio, search, images, convert
from app.api.tracks import _ensure_mp4_faststart, DOWNLOAD_DIR
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    # При старте: применяем faststart ко всем MP4 в папке downloads.
    # Без этого браузер не может seekать видео (moov atom в конце файла).
    for mp4_path in DOWNLOAD_DIR.glob("*.mp4"):
        _ensure_mp4_faststart(mp4_path)
    yield

app = FastAPI(title="Quiz Media Tool", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Accept-Ranges",
        "Content-Length",
        "Content-Range",
        "Content-Type",
    ],
)

app.include_router(download.router, prefix="/download")
app.include_router(tracks.router, prefix="/tracks")
app.include_router(export.router, prefix="/export")
app.include_router(audio.router)
app.include_router(search.router, prefix="/search")
app.include_router(images.router, prefix="/images")
app.include_router(convert.router, prefix="/convert")

@app.get("/")
def root():
    return {"status": "ok"}
