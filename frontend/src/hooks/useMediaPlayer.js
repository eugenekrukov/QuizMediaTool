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

  const stopRegionPlayback = () => {
    isPlayingRegionRef.current = false;
    currentRegionEndRef.current = null;
  };

  // ── Seek / Play ───────────────────────────────────────────────────────────

  const seekTo = (time, shouldPlay = false) => {
    if (!wavesurferRef.current) return;
    const t = Math.max(0, time || 0);
    wavesurferRef.current.setTime(t);
    setCurrentTime(t);
    if (shouldPlay) {
      wavesurferRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const playRegion = (start, end) => {
    if (!wavesurferRef.current) return;
    isPlayingRegionRef.current = true;
    currentRegionEndRef.current = end;
    // WaveSurfer's built-in play(start, end) sets stopAtPosition and stops automatically
    wavesurferRef.current.play(start, end).catch(() => {});
    setIsPlaying(true);
  };

  const togglePlay = () => {
    if (!wavesurferRef.current) return;

    if (isPlayingRegionRef.current) {
      // Pause during region playback
      isPlayingRegionRef.current = false;
      wavesurferRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (currentRegionEndRef.current !== null) {
      // Resume region playback from current position (don't seek back to start)
      isPlayingRegionRef.current = true;
      wavesurferRef.current.play(undefined, currentRegionEndRef.current).catch(() => {});
      setIsPlaying(true);
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

        // Для видео:
        //   media = videoRef.current → WaveSurfer управляет seek/play/pause видеоэлемента
        //   peaks + duration → из сконвертированного аудио (декодируем клиентски).
        //   Передавать url нельзя — WaveSurfer перезапишет src видеоэлемента аудиофайлом.
        // Для аудио: только url.
        let wsOptions;
        if (fileType === "video") {
          if (!videoRef.current) {
            console.error("videoRef.current не доступен при инициализации плеера");
            return;
          }

          setIsConverting(true);
          let audioFile;
          try {
            audioFile = await convertVideoToAudioAPI(currentTrack);
          } catch (err) {
            console.error("Ошибка конвертации:", err);
            alert(`Не удалось конвертировать видео: ${err.message}`);
            return;
          }

          if (!audioFile) {
            return;
          }

          // Декодируем аудиофайл клиентски → получаем пики для волны
          let peaks;
          let audioDuration;
          try {
            const audioUrl = `http://127.0.0.1:8000/audio/${encodeURIComponent(audioFile)}`;
            const response  = await fetch(audioUrl);
            const arrayBuf  = await response.arrayBuffer();
            const audioCtx  = new AudioContext();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
            audioCtx.close();

            audioDuration = audioBuffer.duration;
            const raw      = audioBuffer.getChannelData(0);
            const numPeaks = 800;
            const block    = Math.floor(raw.length / numPeaks);
            peaks = Array.from({ length: numPeaks }, (_, i) => {
              let max = 0;
              for (let j = 0; j < block; j++) max = Math.max(max, Math.abs(raw[i * block + j] || 0));
              return max;
            });
          } catch (err) {
            console.error("Ошибка декодирования аудио:", err);
            // Продолжим без пиков — волна не отрисуется, но плеер работает
          } finally {
            setIsConverting(false);
          }

          wsOptions = {
            media:    videoRef.current,
            peaks:    peaks ? [peaks] : undefined,
            duration: audioDuration,
          };
        } else {
          wsOptions = {
            url: `http://127.0.0.1:8000/audio/${encodeURIComponent(currentTrack)}`,
          };
        }

        // Ждём, пока React смонтирует контейнер после setIsConverting(false)
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (!containerRef.current) return;
        containerRef.current.innerHTML = "";

        const ws = WaveSurfer.create({
          container:     containerRef.current,
          waveColor:     "#475569",
          progressColor: "#3b82f6",
          cursorColor:   "#ef4444",
          cursorWidth:   2,
          height:        100,
          interact:      true,
          dragToSeek:    true,
          ...wsOptions,
        });

        const regions = RegionsPlugin.create();
        ws.registerPlugin(regions);
        wavesurferRef.current    = ws;
        regionsPluginRef.current = regions;

        ws.on("play",   () => setIsPlaying(true));
        ws.on("pause",  () => {
          setIsPlaying(false);
          isPlayingRegionRef.current = false;
          // If WaveSurfer stopped at the region end, clear the end marker
          if (currentRegionEndRef.current !== null) {
            const ct = ws.getCurrentTime();
            if (ct >= currentRegionEndRef.current - 0.1) {
              currentRegionEndRef.current = null;
            }
          }
        });
        ws.on("finish", () => { setIsPlaying(false); stopRegionPlayback(); });

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
          stopRegionPlayback();
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
  useEffect(() => { return () => stopRegionPlayback(); }, []);

  // Сброс при смене трека
  useEffect(() => {
    stopRegionPlayback();
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
