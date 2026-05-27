import { useState } from "react";
import { downloadAPI } from "../api";

/**
 * Скачивание файлов по URL (форма «По ссылке»).
 *
 * @param {Object} params
 * @param {Function} params.onTracksRefresh - вызывается после успешного скачивания
 */
export function useDownload({ onTracksRefresh }) {
  const [urlsText, setUrlsText] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadType, setDownloadType] = useState("audio");
  const [downloadProgress, setDownloadProgress] = useState({
    current: 0,
    total: 0,
    status: "idle",
  });

  const handleDownload = async () => {
    const urlsArray = urlsText
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    if (urlsArray.length === 0) {
      alert("Введите ссылки на YouTube или Spotify");
      return;
    }

    setIsDownloading(true);
    setDownloadProgress({
      current: 0,
      total: urlsArray.length,
      status: "downloading",
    });

    try {
      const data = await downloadAPI(urlsArray, downloadType);
      const downloadedCount = data.downloaded?.length || 0;

      setDownloadProgress({
        current: downloadedCount,
        total: urlsArray.length,
        status: "completed",
      });

      if (downloadedCount > 0) {
        setUrlsText("");
        await onTracksRefresh();
        alert(`✅ Скачано ${downloadedCount} треков`);
      }

      setTimeout(
        () => setDownloadProgress({ current: 0, total: 0, status: "idle" }),
        3000
      );
    } catch (error) {
      console.error("Ошибка:", error);
      alert(`❌ Ошибка: ${error.message}`);
      setDownloadProgress({ current: 0, total: 0, status: "error" });
    } finally {
      setIsDownloading(false);
    }
  };

  return {
    urlsText,
    setUrlsText,
    isDownloading,
    downloadType,
    setDownloadType,
    downloadProgress,
    handleDownload,
  };
}
