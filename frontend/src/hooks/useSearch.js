import { useState } from "react";
import { searchYouTubeAPI, downloadAPI } from "../api";

/**
 * Поиск по YouTube и скачивание из результатов поиска.
 */
export function useSearch({ onTracksRefresh }) {
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching,   setIsSearching]   = useState(false);
  const [searchError,   setSearchError]   = useState(null);
  const [downloadingIds, setDownloadingIds] = useState({});
  const [previewVideo,  setPreviewVideo]  = useState(null);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    setSearchError(null);
    try {
      const results = await searchYouTubeAPI(searchQuery.trim());
      setSearchResults(results);
    } catch (err) {
      console.error("Ошибка поиска:", err);
      setSearchError(err.message || "Не удалось подключиться к серверу. Убедитесь, что бэкенд запущен.");
    } finally {
      setIsSearching(false);
    }
  };

  const downloadFromSearch = async (video, type) => {
    const key = `${video.id}-${type}`;
    setDownloadingIds((prev) => ({ ...prev, [key]: true }));
    try {
      const data = await downloadAPI([video.url], type);
      if (data.downloaded?.length > 0) await onTracksRefresh();
    } catch (err) {
      console.error("Ошибка скачивания:", err);
    } finally {
      setDownloadingIds((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchError,
    downloadingIds,
    previewVideo,
    setPreviewVideo,
    handleSearch,
    downloadFromSearch,
  };
}
