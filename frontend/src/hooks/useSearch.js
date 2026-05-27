import { useState } from "react";
import { searchYouTubeAPI, searchSpotifyAPI, downloadAPI } from "../api";

/**
 * Поиск по YouTube / Spotify и скачивание из результатов поиска.
 *
 * @param {Object} params
 * @param {Function} params.onTracksRefresh - вызывается после успешного скачивания
 */
export function useSearch({ onTracksRefresh }) {
  const [searchSource, setSearchSource] = useState("youtube"); // "youtube" | "spotify"
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [downloadingIds, setDownloadingIds] = useState({}); // { "videoId-type": true }
  const [previewVideo, setPreviewVideo] = useState(null);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    setSearchError(null);
    try {
      const results =
        searchSource === "spotify"
          ? await searchSpotifyAPI(searchQuery.trim())
          : await searchYouTubeAPI(searchQuery.trim());
      setSearchResults(results);
    } catch (err) {
      console.error("Ошибка поиска:", err);
      setSearchError(
        err.message ||
          "Не удалось подключиться к серверу. Убедитесь, что бэкенд запущен."
      );
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
    searchSource,
    setSearchSource,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchError,
    downloadingIds,
    setDownloadingIds,
    previewVideo,
    setPreviewVideo,
    handleSearch,
    downloadFromSearch,
  };
}
