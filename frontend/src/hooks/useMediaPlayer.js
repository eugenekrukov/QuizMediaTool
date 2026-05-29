import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/plugins/regions";
import { getFileType } from "../utils";
import { convertVideoToAudioAPI } from "../api";

/**
 * Управляет WaveSurfer и регионами.
 * Видео-файлы автоматически конвертируются в аудио и воспроизводятся
 * через WaveSurfer — без отдельного <video> элемента.
 */
export function useMediaPlayer({
  savedQuizData,
  onSavedQuizData,
  currentTrack,
  onHasUnsavedChanges,
}) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const containerRef         = useRef(null);
  const videoRef             = useRef(null);
  const wavesurferRef        = useRef(null);
  const regionsPluginRef     = useRef(null);
  const isInitialLoadingRef  = useRef(false);
  const regionIntervalRef    = useRef(null);
  const isPlayingRegionRef   = useRef(false);
  const currentRegionEndRef  = useRef(null);
  const audioElementRef      = useRef(null);
  const togglePlayRef        = useRef(null);
  const regionClickedRef     = useRef(false);
  const savedQuizDataRef     = useRef({});

  // ── State ─────────────────────────────────────────────────────────────────
  const [isPlaying,       setIsPlaying]       = useState(false);
  const [currentTime,     setCurrentTime]     = useState(0);
  const [duration,        setDuration]        = useState(0);
  const [currentFileType, setCurrentFileType] = useState("audio");
  const [isConverting,    setIsConverting]    = useState(false);
  const [activeRegions,   setActiveRegions]   = useState([]);

  useEffect(() => {
    savedQuizDataRef.current = savedQuizData;
  }, [savedQuizData]);

  // ── Регионы ───────────────────────────────────────────────────────────────

  const syncRegionsState = () => {
    if (!regionsPluginRef.current) return;
    setActiveRegions(
      regionsPluginRef.current.getRegions().map((r) => ({
        id: r.id, start: r.start, end: r.end, color: r.color,
      }))
    );
  };

  const pauseRegionPlayback = () => {
    if (regionIntervalRef.current) {
      clearInterval(regionIntervalRef.current);
      regionIntervalRef.current = null;
    }
    isPlayingRegionRef.current = false;
  };

  const clearRegionInterval = () => {
    pauseRegionPlayback();
    currentRegionEndRef.current = null;
  };

  const startRegionInterval = (end) => {
    if (regionIntervalRef.current) clearInterval(regionIntervalRef.current);
    isPlayingRegionRef.current = true;
    currentRegionEndRef.current = end;
    regionIntervalRef.current = setInterval(() => {
      const pos = wavesurferRef.current?.getCurrentTime();
      if (pos !== undefined && pos >= end) {
        wavesurferRef.current?.pause();
        setIsPlaying(false);
        clearRegionInterval();
      }
    }, 50);
  };

  // ── Seek / Play ───────────────────────────────────────────────────────────

  const seekTo = (time, shouldPlay = false) => {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.setTime(Math.max(0, time || 0));
    setCurrentTime(Math.max(0, time || 0));
    if (shouldPlay) {
      wavesurferRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const playRegion = (start, end) => {
    if (!wavesurferRef.current) return;
    clearRegionInterval();
    seekTo(start);
    wavesurferRef.current.play();
    setIsPlaying(true);
    startRegionInterval(end);
  };

  const togglePlay = () => {
    if (!wavesurferRef.current) return;

    if (isPlayingRegionRef.current) {
      pauseRegionPlayback();
      wavesurferRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (currentRegionEndRef.current !== null) {
      wavesurferRef.current.play();
      setIsPlaying(true);
      startRegionInterval(currentRegionEndRef.current);
      return;
    }

    wavesurferRef.current.playPause();
  };
  togglePlayRef.current = togglePlay;

  // ── Управление регионами ──────────────────────────────────────────────────

  const addQuestionRegion = () => {
    if (!wavesurferRef.current || !regionsPluginRef.current) return;
    const ct  = wavesurferRef.current.getCurrentTime();
    const dur = wavesurferRef.current.getDuration();
    regionsPluginRef.current.addRegion({
      start: ct, end: Math.min(ct + 5, dur),
      color: "rgba(59, 130, 246, 0.3)", drag: true, resize: true,
    });
  };

  const addAnswerRegion = () => {
    if (!wavesurferRef.current || !regionsPluginRef.current) return;
    const ct  = wavesurferRef.current.getCurrentTime();
    const dur = wavesurferRef.current.getDuration();
    regionsPluginRef.current.addRegion({
      start: ct, end: Math.min(ct + 5, dur),
      color: "rgba(16, 185, 129, 0.3)", drag: true, resize: true,
    });
  };

  const removeTimelineRegion = (id) => {
    if (!regionsPluginRef.current) return;
    regionsPluginRef.current.getRegions().find((r) => r.id === id)?.remove();
  };

  const saveCurrentTrackSegments = () => {
    if (!currentTrack || !regionsPluginRef.current) return;
    const sorted = [...regionsPluginRef.current.getRegions()].sort((a, b) => a.start - b.start);
    let qCount = 0, aCount = 0;
    const formattedSegments = sorted.map((reg) => {
      const isQuestion = reg.color.includes("59, 130, 246");
      if (isQuestion) qCount++; else aCount++;
      const base         = currentTrack.replace(/\.[^/.]+$/, "");
      const defaultLabel = isQuestion ? `${base} вопрос ${qCount}` : `${base} ответ ${aCount}`;
      const userLabel    = prompt("Введите название для отрезка:", defaultLabel);
      return {
        id: reg.id, start: reg.start, end: reg.end,
        type: isQuestion ? "question" : "answer",
        label: userLabel?.trim() || defaultLabel,
      };
    });
    onSavedQuizData(currentTrack, formattedSegments);
    onHasUnsavedChanges(false);
    alert("Отрезки успешно зафиксированы!");
  };

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

        // Для видео конвертируем в аудио — воспроизводим через WaveSurfer
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

        const audioElement = new Audio();
        audioElement.crossOrigin = "anonymous";
        audioElement.src = `http://127.0.0.1:8000/audio/${encodeURIComponent(audioFile)}`;
        audioElement.preload = "metadata";
        audioElementRef.current = audioElement;

        await new Promise((resolve, reject) => {
          audioElement.addEventListener("loadedmetadata", resolve);
          audioElement.addEventListener("error", reject);
          audioElement.load();
        });

        const ws = WaveSurfer.create({
          container:     containerRef.current,
          waveColor:     "#475569",
          progressColor: "#3b82f6",
          cursorColor:   "#ef4444",
          cursorWidth:   2,
          height:        100,
          backend:       "MediaElement",
          media:         audioElement,
          interact:      true,
          dragToSeek:    true,
        });

        const regions = RegionsPlugin.create();
        ws.registerPlugin(regions);
        wavesurferRef.current    = ws;
        regionsPluginRef.current = regions;

        ws.on("play",   () => setIsPlaying(true));
        ws.on("pause",  () => setIsPlaying(false));
        ws.on("finish", () => { setIsPlaying(false); clearRegionInterval(); });

        ws.on("ready", () => {
          setDuration(ws.getDuration());
          setCurrentTime(0);

          isInitialLoadingRef.current = true;
          const existing = savedQuizDataRef.current[currentTrack] || [];
          existing.forEach((seg) => {
            regions.addRegion({
              id:    seg.id,
              start: seg.start,
              end:   seg.end,
              color: seg.type === "question"
                ? "rgba(59, 130, 246, 0.3)"
                : "rgba(16, 185, 129, 0.3)",
              drag: true, resize: true,
            });
          });
          syncRegionsState();
          setTimeout(() => {
            isInitialLoadingRef.current = false;
            onHasUnsavedChanges(false);
          }, 100);
        });

        ws.on("error",      (e) => console.error("WaveSurfer error:", e));
        ws.on("timeupdate", (t) => setCurrentTime(t));

        // Регионы
        regions.on("region-update",  () => { syncRegionsState(); if (!isInitialLoadingRef.current) onHasUnsavedChanges(true); });
        regions.on("region-updated", () => syncRegionsState());
        regions.on("region-created", () => { syncRegionsState(); if (!isInitialLoadingRef.current) onHasUnsavedChanges(true); });
        regions.on("region-removed", () => { syncRegionsState(); if (!isInitialLoadingRef.current) onHasUnsavedChanges(true); });

        // Клик по волне → seek
        ws.on("interaction", (newTime) => {
          if (regionClickedRef.current) return;
          const t = typeof newTime === "number" ? newTime : ws.getCurrentTime();
          clearRegionInterval();
          const wasPlaying = ws.isPlaying();
          seekTo(t);
          if (wasPlaying) { ws.play().catch(() => {}); setIsPlaying(true); }
        });

        // Клик по региону → воспроизвести отрезок
        regions.on("region-click", (region, e) => {
          e.stopPropagation();
          regionClickedRef.current = true;
          setTimeout(() => { regionClickedRef.current = false; }, 0);
          playRegion(region.start, region.end);
        });

      } catch (error) {
        console.error("Ошибка при инициализации плеера:", error);
        if (containerRef.current) {
          containerRef.current.innerHTML =
            `<div style="text-align:center;padding:40px;color:#ef4444">❌ Ошибка загрузки: ${error.message}</div>`;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack]);

  // Очистка при размонтировании
  useEffect(() => { return () => clearRegionInterval(); }, []);

  // Сброс при смене трека
  useEffect(() => {
    clearRegionInterval();
    setIsPlaying(false);
    if (wavesurferRef.current) wavesurferRef.current.pause();
  }, [currentTrack]);

  // Пробел → play/pause
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space") return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      e.preventDefault();
      togglePlayRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── Публичный API ─────────────────────────────────────────────────────────
  return {
    containerRef,
    videoRef,
    isPlaying,
    currentTime,
    duration,
    currentFileType,
    isConverting,
    activeRegions,
    togglePlay,
    playRegion,
    addQuestionRegion,
    addAnswerRegion,
    removeTimelineRegion,
    saveCurrentTrackSegments,
    resetPlayer,
  };
}
