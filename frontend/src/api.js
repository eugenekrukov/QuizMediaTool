const BASE = "http://127.0.0.1:8000";

// ── Треки ──────────────────────────────────────────────────────────────────

export const fetchTracksAPI = async () => {
  const res = await fetch(`${BASE}/tracks/`);
  const data = await res.json();
  return data.tracks || [];
};

export const deleteTrackAPI = async (trackName) => {
  const res = await fetch(`${BASE}/tracks/${encodeURIComponent(trackName)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Ошибка при удалении");
};

export const convertVideoToAudioAPI = async (videoFilename) => {
  const res = await fetch(
    `${BASE}/tracks/convert-to-audio/${encodeURIComponent(videoFilename)}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`Ошибка конвертации: ${res.status}`);
  const data = await res.json();
  return data.audio_file;
};

// ── Скачивание ─────────────────────────────────────────────────────────────

export const downloadAPI = async (urls, downloadType) => {
  const res = await fetch(`${BASE}/download/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls, download_type: downloadType }),
  });
  if (!res.ok) throw new Error("Ошибка сервера");
  return res.json();
};

// ── Поиск ──────────────────────────────────────────────────────────────────

export const searchYouTubeAPI = async (query) => {
  const res = await fetch(`${BASE}/search/?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `Ошибка сервера: ${res.status}`);
  return data.results || [];
};

// ── Изображения ────────────────────────────────────────────────────────────

export const fetchImagesAPI = async () => {
  const res = await fetch(`${BASE}/images/`);
  return res.json();
};

export const deleteImageAPI = async (filename) => {
  const res = await fetch(`${BASE}/images/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Ошибка при удалении");
};

export const saveImagesDirAPI = async (newDir) => {
  const res = await fetch(`${BASE}/images/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images_dir: newDir }),
  });
  if (!res.ok) throw new Error("Ошибка сохранения настроек");
  return res.json();
};

// ── Экспорт ────────────────────────────────────────────────────────────────

export const exportSegmentsAPI = async (segments) => {
  const res = await fetch(`${BASE}/export/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments }),
  });
  if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
};
