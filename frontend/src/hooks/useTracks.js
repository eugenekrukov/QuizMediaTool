import { useState, useEffect } from "react";
import { fetchTracksAPI } from "../api";

/**
 * Управляет списком треков, текущим треком и флагом несохранённых изменений.
 */
export function useTracks() {
  const [tracks, setTracks] = useState([]);
  const [currentTrack, setCurrentTrack] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const fetchTracks = async () => {
    try {
      const list = await fetchTracksAPI();
      setTracks(list);
    } catch (err) {
      console.error("Ошибка загрузки треков:", err);
    }
  };

  useEffect(() => {
    fetchTracks();
  }, []);

  return {
    tracks,
    setTracks,
    currentTrack,
    setCurrentTrack,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    fetchTracks,
  };
}
