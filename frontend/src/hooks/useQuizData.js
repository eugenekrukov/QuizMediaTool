import { useState } from "react";
import { exportSegmentsAPI } from "../api";

/**
 * Хранит зафиксированные отрезки (savedQuizData) и управляет экспортом.
 */
export function useQuizData() {
  const [savedQuizData, setSavedQuizData] = useState({});
  const [isExporting, setIsExporting] = useState(false);

  const setTrackSegments = (trackName, segments) => {
    setSavedQuizData((prev) => ({ ...prev, [trackName]: segments }));
  };

  const deleteSavedSegment = (trackName, segmentId) => {
    setSavedQuizData((prev) => {
      const updatedSegments = prev[trackName].filter((seg) => seg.id !== segmentId);
      const newQuizData = { ...prev };
      if (updatedSegments.length > 0) {
        newQuizData[trackName] = updatedSegments;
      } else {
        delete newQuizData[trackName];
      }
      return newQuizData;
    });
  };

  const deleteTrackQuizData = (trackName) => {
    setSavedQuizData((prev) => {
      const updated = { ...prev };
      delete updated[trackName];
      return updated;
    });
  };

  const handleExportAll = async () => {
    const hasSegments = Object.keys(savedQuizData).some(
      (trackName) => savedQuizData[trackName]?.length > 0
    );
    if (!hasSegments) {
      alert("Нет данных для экспорта!");
      return;
    }

    setIsExporting(true);

    const flatSegments = [];
    Object.keys(savedQuizData).forEach((trackName) => {
      savedQuizData[trackName].forEach((seg) => {
        flatSegments.push({
          id: seg.id,
          track_name: trackName,
          start: parseFloat(seg.start),
          end: parseFloat(seg.end),
          type: seg.type,
          label: seg.label || "",
        });
      });
    });

    try {
      await exportSegmentsAPI(flatSegments);
      setSavedQuizData({});
      alert("✅ Проект успешно экспортирован!");
    } catch (err) {
      console.error("Ошибка:", err);
      alert(`❌ ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const hasAnySavedSegments = Object.keys(savedQuizData).length > 0;

  return {
    savedQuizData,
    setSavedQuizData,
    isExporting,
    setTrackSegments,
    deleteSavedSegment,
    deleteTrackQuizData,
    handleExportAll,
    hasAnySavedSegments,
  };
}
