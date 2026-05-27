import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/plugins/regions";
import { getFileType } from "../utils";
import { convertVideoToAudioAPI } from "../api";

/**
 * Управляет WaveSurfer, синхронизацией видео и регионами.
 *
 * @param {Object} params
 * @param {Object}   params.savedQuizData      - текущие зафиксированные отрезки (читается через ref)
 * @param {Function} params.onSavedQuizData    - (trackName, segments) => void — сохранить отрезки
 * @param {string}   params.currentTrack       - имя текущего трека
 * @param {Function} params.onHasUnsavedChanges - (bool) => void
 */
export function useMediaPlayer({
  savedQuizData,
  onSavedQuizData,
  currentTrack,
  onHasUnsavedChanges,
}) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const wavesurferRef = useRef(null);
  const regionsPluginRef = useRef(null);
  const isInitialLoadingRef = useRef(false);
  const regionIntervalRef = useRef(null);
  const isPlayingRegionRef = useRef(false);
  const currentRegionEndRef = useRef(null);
  const audioElementRef = useRef(null);
  const togglePlayRef = useRef(null); // всегда актуальная ссылка для keydown
  const regionClickedRef = useRef(false);
  const isSeekingFromWSRef = useRef(false);
  const savedQuizDataRef = useRef({}); // синхронизируется с savedQuizData без пересоздания плеера

  // ── State ─────────────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentFileType, setCurrentFileType] = useState("audio");
  const [isConverting, setIsConverting] = useState(false);
  const [activeRegions, setActiveRegions] = useState([]);

  // Синхронизируем ref с prop, чтобы не пересоздавать плеер при изменении отрезков
  useEffect(() => {
    savedQuizDataRef.current = savedQuizData;
  }, [savedQuizData]);

  // ── Регионы: вспомогательные функции ─────────────────────────────────────

  const syncRegionsState = () => {
    if (!regionsPluginRef.current) return;
    const regionsList = regionsPluginRef.current.getRegions().map((reg) => ({
      id: reg.id,
      start: reg.start,
      end: reg.end,
      color: reg.color,
    }));
    setActiveRegions(regionsList);
  };

  // ── Управление интервалом-ограничителем отрезка ───────────────────────────

  /** Пауза в режиме отрезка — граница конца сохраняется для возобновления */
  const pauseRegionPlayback = () => {
    if (regionIntervalRef.current) {
      clearInterval(regionIntervalRef.current);
      regionIntervalRef.current = null;
    }
    isPlayingRegionRef.current = false;
  };

  /** Полный выход из режима отрезка */
  const clearRegionInterval = () => {
    pauseRegionPlayback();
    currentRegionEndRef.current = null;
  };

  const startRegionInterval = (end, fileType) => {
    if (regionIntervalRef.current) clearInterval(regionIntervalRef.current);
    isPlayingRegionRef.current = true;
    currentRegionEndRef.current = end;
    regionIntervalRef.current = setInterval(() => {
      const pos =
        fileType === "video"
          ? videoRef.current?.currentTime
          : wavesurferRef.current?.getCurrentTime();
      if (pos !== undefined && pos >= end) {
        if (fileType === "video") videoRef.current?.pause();
        else wavesurferRef.current?.pause();
        setIsPlaying(false);
        clearRegionInterval();
      }
    }, 50);
  };

  // ── Воспроизведение регионов ──────────────────────────────────────────────

  const playRegion = (start, end) => {
    if (!wavesurferRef.current) return;
    clearRegionInterval();
    wavesurferRef.current.setTime(start);
    wavesurferRef.current.play();
    setIsPlaying(true);
    startRegionInterval(end, "audio");
  };

  const playVideoRegion = (start, end) => {
    if (!videoRef.current) return;
    clearRegionInterval();
    if (wavesurferRef.current) wavesurferRef.current.setTime(start);
    isSeekingFromWSRef.current = true;
    videoRef.current.currentTime = start;
    setCurrentTime(start);
    videoRef.current.play().catch(() => {});
    setIsPlaying(true);
    startRegionInterval(end, "video");
  };

  // ── Единая точка управления воспроизведением ──────────────────────────────
  // Три режима:
  //   1. Играет отрезок → пауза (граница сохраняется)
  //   2. Пауза после отрезка → возобновление с той же границей
  //   3. Свободное воспроизведение → обычный toggle

  const togglePlay = () => {
    if (isPlayingRegionRef.current) {
      pauseRegionPlayback();
      if (currentFileType === "video" && videoRef.current)
        videoRef.current.pause();
      else if (wavesurferRef.current) wavesurferRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (currentRegionEndRef.current !== null) {
      if (currentFileType === "video" && videoRef.current) {
        videoRef.current.play();
        setIsPlaying(true);
        startRegionInterval(currentRegionEndRef.current, "video");
      } else if (wavesurferRef.current) {
        wavesurferRef.current.play();
        setIsPlaying(true);
        startRegionInterval(currentRegionEndRef.current, "audio");
      }
      return;
    }

    if (currentFileType === "video") {
      if (videoRef.current) {
        if (videoRef.current.paused) {
          videoRef.current.play();
          setIsPlaying(true);
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }
    } else {
      if (wavesurferRef.current) wavesurferRef.current.playPause();
    }
  };
  togglePlayRef.current = togglePlay; // обновляем ref при каждом рендере

  // ── Обработчики событий видео ─────────────────────────────────────────────

  const handleVideoSeeking = () => {
    // No-op: финальная синхронизация WS делается в onSeeked
  };

  const handleVideoSeeked = () => {
    if (!videoRef.current) return;
    // Если seek инициирован нами — WS уже установлен, не перетираем позицию
    if (isSeekingFromWSRef.current) {
      isSeekingFromWSRef.current = false;
      return;
    }
    // Внешний seek (нативные controls) — синхронизируем волну с видео
    const finalTime = videoRef.current.currentTime;
    setCurrentTime(finalTime);
    if (wavesurferRef.current) {
      const wsTime = wavesurferRef.current.getCurrentTime();
      if (Math.abs(finalTime - wsTime) > 0.05) {
        wavesurferRef.current.setTime(finalTime);
      }
    }
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current || videoRef.current.seeking) return;
    const videoTime = videoRef.current.currentTime;
    setCurrentTime(videoTime);
    if (wavesurferRef.current) {
      const wsTime = wavesurferRef.current.getCurrentTime();
      if (Math.abs(videoTime - wsTime) > 0.1) {
        wavesurferRef.current.setTime(videoTime);
      }
    }
  };

  const handleVideoPlay = () => {
    // Не сбрасываем интервал если воспроизводим регион —
    // иначе событие play уничтожит boundary-check сразу после его создания
    if (!isPlayingRegionRef.current) {
      clearRegionInterval();
    }
    setIsPlaying(true);
  };

  const handleVideoPause = () => setIsPlaying(false);

  const handleVideoEnded = () => {
    setIsPlaying(false);
    clearRegionInterval();
  };

  // ── Управление регионами ──────────────────────────────────────────────────

  const addQuestionRegion = () => {
    if (!wavesurferRef.current || !regionsPluginRef.current) return;
    const ct = wavesurferRef.current.getCurrentTime();
    const dur = wavesurferRef.current.getDuration();
    regionsPluginRef.current.addRegion({
      start: ct,
      end: Math.min(ct + 5, dur),
      color: "rgba(59, 130, 246, 0.3)",
      drag: true,
      resize: true,
    });
  };

  const addAnswerRegion = () => {
    if (!wavesurferRef.current || !regionsPluginRef.current) return;
    const ct = wavesurferRef.current.getCurrentTime();
    const dur = wavesurferRef.current.getDuration();
    regionsPluginRef.current.addRegion({
      start: ct,
      end: Math.min(ct + 5, dur),
      color: "rgba(16, 185, 129, 0.3)",
      drag: true,
      resize: true,
    });
  };

  const removeTimelineRegion = (id) => {
    if (!regionsPluginRef.current) return;
    const reg = regionsPluginRef.current.getRegions().find((r) => r.id === id);
    if (reg) reg.remove();
  };

  const saveCurrentTrackSegments = () => {
    if (!currentTrack || !regionsPluginRef.current) return;
    const wsRegions = regionsPluginRef.current.getRegions();
    const sorted = [...wsRegions].sort((a, b) => a.start - b.start);

    let qCount = 0,
      aCount = 0;
    const formattedSegments = sorted.map((reg) => {
      const isQuestion = reg.color.includes("59, 130, 246");
      if (isQuestion) qCount++;
      else aCount++;

      const baseName = currentTrack.replace(/\.[^/.]+$/, "");
      const defaultLabel = isQuestion
        ? `${baseName} вопрос ${qCount}`
        : `${baseName} ответ ${aCount}`;

      const userLabel = prompt("Введите название для отрезка:", defaultLabel);
      return {
        id: reg.id,
        start: reg.start,
        end: reg.end,
        type: isQuestion ? "question" : "answer",
        label: userLabel?.trim() || defaultLabel,
      };
    });

    onSavedQuizData(currentTrack, formattedSegments);
    onHasUnsavedChanges(false);
    alert("Отрезки успешно зафиксированы!");
  };

  /** Сбрасывает визуализацию при удалении трека */
  const resetPlayer = () => {
    setActiveRegions([]);
    if (wavesurferRef.current) wavesurferRef.current.empty();
  };

  // ── WaveSurfer: инициализация ─────────────────────────────────────────────

  useEffect(() => {
    if (!currentTrack || !containerRef.current) return;

    const initPlayer = async () => {
      try {
        setIsPlaying(false);
        setActiveRegions([]);
        setCurrentTime(0);
        setDuration(0);

        const fileType = getFileType(currentTrack);
        setCurrentFileType(fileType);

        let audioFile = currentTrack;

        if (fileType === "video") {
          setIsConverting(true);
          try {
            const converted = await convertVideoToAudioAPI(currentTrack);
            if (converted) {
              audioFile = converted;
            } else {
              if (containerRef.current) {
                containerRef.current.innerHTML =
                  '<div style="text-align:center;padding:40px;color:#ef4444">❌ Не удалось конвертировать видео в аудио</div>';
              }
              return;
            }
          } catch (err) {
            console.error("Ошибка конвертации:", err);
            alert(`Не удалось конвертировать видео в аудио: ${err.message}`);
            return;
          } finally {
            setIsConverting(false);
          }
        }

        if (containerRef.current) containerRef.current.innerHTML = "";
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (!containerRef.current) return;

        // Создаём аудио-элемент только для WaveSurfer
        const audioElement = new Audio();
        audioElement.crossOrigin = "anonymous";
        audioElement.src = `http://127.0.0.1:8000/audio/${encodeURIComponent(audioFile)}`;
        audioElement.preload = "metadata";
        // Для видео-файлов глушим audio element WaveSurfer'а — звук идёт из <video>
        if (fileType === "video") audioElement.muted = true;
        audioElementRef.current = audioElement;

        await new Promise((resolve, reject) => {
          audioElement.addEventListener("loadedmetadata", resolve);
          audioElement.addEventListener("error", reject);
          audioElement.load();
        });

        const ws = WaveSurfer.create({
          container: containerRef.current,
          waveColor: "#475569",
          progressColor: "#3b82f6",
          cursorColor: "#ef4444",
          cursorWidth: 2,
          height: 100,
          backend: "MediaElement",
          media: audioElement,
          interact: true,
          dragToSeek: true,
        });

        const regions = RegionsPlugin.create();
        ws.registerPlugin(regions);
        wavesurferRef.current = ws;
        regionsPluginRef.current = regions;

        ws.on("play", () => {
          if (fileType === "video") {
            // WaveSurfer используется только для визуализации — сразу останавливаем
            ws.pause();
            return;
          }
          setIsPlaying(true);
        });
        ws.on("pause", () => {
          if (fileType !== "video") setIsPlaying(false);
        });
        ws.on("finish", () => {
          if (fileType !== "video") setIsPlaying(false);
          clearRegionInterval();
        });

        ws.on("ready", () => {
          setDuration(ws.getDuration());
          setCurrentTime(0);

          isInitialLoadingRef.current = true;
          const existing = savedQuizDataRef.current[currentTrack] || [];
          existing.forEach((seg) => {
            regions.addRegion({
              id: seg.id,
              start: seg.start,
              end: seg.end,
              color:
                seg.type === "question"
                  ? "rgba(59, 130, 246, 0.3)"
                  : "rgba(16, 185, 129, 0.3)",
              drag: true,
              resize: true,
            });
          });
          syncRegionsState();
          setTimeout(() => {
            isInitialLoadingRef.current = false;
            onHasUnsavedChanges(false);
          }, 100);
        });

        ws.on("error", (error) => console.error("WaveSurfer error:", error));

        ws.on("timeupdate", (time) => {
          if (fileType !== "video") setCurrentTime(time);
        });

        // ── События регионов ──────────────────────────────────────────────
        regions.on("region-update", () => {
          syncRegionsState();
          if (!isInitialLoadingRef.current) onHasUnsavedChanges(true);
        });
        regions.on("region-updated", () => syncRegionsState());
        regions.on("region-created", () => {
          syncRegionsState();
          if (!isInitialLoadingRef.current) onHasUnsavedChanges(true);
        });
        regions.on("region-removed", () => {
          syncRegionsState();
          if (!isInitialLoadingRef.current) onHasUnsavedChanges(true);
        });

        ws.on("interaction", (newTime) => {
          if (regionClickedRef.current) return;
          const seekTime =
            typeof newTime === "number" ? newTime : ws.getCurrentTime();
          clearRegionInterval();

          if (fileType === "video" && videoRef.current) {
            const wasPlaying = !videoRef.current.paused;
            isSeekingFromWSRef.current = true;
            videoRef.current.currentTime = seekTime;
            setCurrentTime(seekTime);
            if (wasPlaying) {
              videoRef.current.play().catch(() => {});
              setIsPlaying(true);
            }
          } else {
            const wasPlaying = ws.isPlaying();
            ws.setTime(seekTime);
            setCurrentTime(seekTime);
            if (wasPlaying) {
              ws.play().catch(() => {});
              setIsPlaying(true);
            }
          }
        });

        regions.on("region-click", (region, e) => {
          e.stopPropagation();
          regionClickedRef.current = true;
          setTimeout(() => {
            regionClickedRef.current = false;
          }, 0);
          if (fileType === "video") playVideoRegion(region.start, region.end);
          else playRegion(region.start, region.end);
        });
      } catch (error) {
        console.error("Ошибка при инициализации плеера:", error);
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444">❌ Ошибка загрузки: ${error.message}</div>`;
        }
      }
    };

    initPlayer();

    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.src = "";
        audioElementRef.current = null;
      }
    };
    // savedQuizData намеренно убран — используем ref, чтобы не пересоздавать плеер
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack]);

  // Очистка интервала при размонтировании
  useEffect(() => {
    return () => clearRegionInterval();
  }, []);

  // Очистка при смене трека
  useEffect(() => {
    clearRegionInterval();
    setIsPlaying(false);
    if (wavesurferRef.current) wavesurferRef.current.pause();
  }, [currentTrack]);

  // Пробел — делегируем в ref, чтобы не пересоздавать listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== "Space") return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      e.preventDefault();
      togglePlayRef.current?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Интервал синхронизации WS с видео
  useEffect(() => {
    if (currentFileType !== "video" || !videoRef.current || !wavesurferRef.current)
      return;

    let syncInterval = null;

    const startSync = () => {
      if (syncInterval) clearInterval(syncInterval);
      syncInterval = setInterval(() => {
        if (
          videoRef.current &&
          wavesurferRef.current &&
          !videoRef.current.paused &&
          !videoRef.current.seeking
        ) {
          const videoTime = videoRef.current.currentTime;
          const wsTime = wavesurferRef.current.getCurrentTime();
          if (Math.abs(videoTime - wsTime) > 0.1) {
            wavesurferRef.current.setTime(videoTime);
          }
        }
      }, 50);
    };

    const stopSync = () => {
      if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
      }
    };

    if (!videoRef.current.paused) startSync();

    const handlePlay = () => startSync();
    const handlePause = () => stopSync();
    videoRef.current.addEventListener("play", handlePlay);
    videoRef.current.addEventListener("pause", handlePause);

    return () => {
      stopSync();
      if (videoRef.current) {
        videoRef.current.removeEventListener("play", handlePlay);
        videoRef.current.removeEventListener("pause", handlePause);
      }
    };
  }, [currentFileType, currentTrack]);

  // ── Публичный API хука ────────────────────────────────────────────────────
  return {
    // Refs
    containerRef,
    videoRef,
    // State
    isPlaying,
    currentTime,
    duration,
    currentFileType,
    isConverting,
    activeRegions,
    // Воспроизведение
    togglePlay,
    playRegion,
    playVideoRegion,
    // Управление регионами
    addQuestionRegion,
    addAnswerRegion,
    removeTimelineRegion,
    saveCurrentTrackSegments,
    resetPlayer,
    // Обработчики событий видео (передаются в JSX через onXxx)
    handleVideoPlay,
    handleVideoPause,
    handleVideoSeeking,
    handleVideoSeeked,
    handleVideoTimeUpdate,
    handleVideoEnded,
  };
}
