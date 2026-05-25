import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/plugins/regions";
import ImageLibrary from "./ImageLibrary";
import ImageEditor from "./ImageEditor";

export default function App() {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const wavesurferRef = useRef(null);
  const regionsPluginRef = useRef(null);
  const isInitialLoadingRef = useRef(false);
  const regionIntervalRef = useRef(null);
  const isPlayingRegionRef = useRef(false);
  const currentRegionEndRef = useRef(null);
  const audioElementRef = useRef(null);
  const togglePlayRef = useRef(null);   // всегда актуальная ссылка на togglePlay для keydown
  const regionClickedRef = useRef(false); // флаг: interaction должен игнорировать этот клик
  const isSeekingFromWSRef = useRef(false); // флаг: seek инициирован из WS interaction, не синхронизировать обратно
  const savedQuizDataRef = useRef({});

  const [tracks, setTracks] = useState([]);
  const [currentTrack, setCurrentTrack] = useState("");
  const [currentAudioTrack, setCurrentAudioTrack] = useState("");
  const [urlsText, setUrlsText] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentFileType, setCurrentFileType] = useState("audio");
  const [isConverting, setIsConverting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [activeRegions, setActiveRegions] = useState([]);
  const [savedQuizData, setSavedQuizData] = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [downloadType, setDownloadType] = useState("audio");

  // Главная навигация
  const [mainTab, setMainTab] = useState("media"); // "media" | "images"

  // Изображения
  const [imagesDir, setImagesDir] = useState("");
  const [imageFiles, setImageFiles] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const imageEditorDirtyRef = useRef(false);
  const handleSelectImage = (img) => {
    if (imageEditorDirtyRef.current && img?.filename !== selectedImage?.filename) {
      if (!window.confirm("Есть несохранённые изменения. Перейти к другому изображению?")) return;
    }
    setSelectedImage(img);
  };

  const [downloadProgress, setDownloadProgress] = useState({
    current: 0,
    total: 0,
    status: 'idle'
  });

  // Поиск
  const [leftTab, setLeftTab] = useState("search"); // "search" | "url"
  const [searchSource, setSearchSource] = useState("youtube"); // "youtube" | "spotify"
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [downloadingIds, setDownloadingIds] = useState({}); // {videoId: "audio"|"video"}
  const [previewVideo, setPreviewVideo] = useState(null); // результат поиска для превью

  // Синхронизируем ref с состоянием, чтобы плеер не пересоздавался при изменении savedQuizData
  useEffect(() => {
    savedQuizDataRef.current = savedQuizData;
  }, [savedQuizData]);

  const getFileType = (filename) => {
    const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov'];
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    return videoExtensions.includes(ext) ? "video" : "audio";
  };

  const formatDuration = (sec) => {
    if (!sec) return "";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds) || timeInSeconds === undefined) return "00:00";
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  useEffect(() => {
    fetchTracks();
  }, []);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    setSearchError(null);
    try {
      const endpoint = searchSource === "spotify"
        ? `http://127.0.0.1:8000/search/spotify?q=${encodeURIComponent(searchQuery.trim())}`
        : `http://127.0.0.1:8000/search/?q=${encodeURIComponent(searchQuery.trim())}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.detail || `Ошибка сервера: ${res.status}`);
      } else {
        setSearchResults(data.results || []);
      }
    } catch (err) {
      console.error("Ошибка поиска:", err);
      setSearchError("Не удалось подключиться к серверу. Убедитесь, что бэкенд запущен.");
    } finally {
      setIsSearching(false);
    }
  };

  const downloadFromSearch = async (video, type) => {
    setDownloadingIds((prev) => ({ ...prev, [`${video.id}-${type}`]: true }));
    try {
      const res = await fetch("http://127.0.0.1:8000/download/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [video.url], download_type: type }),
      });
      const data = await res.json();
      if (data.downloaded?.length > 0) await fetchTracks();
    } catch (err) {
      console.error("Ошибка скачивания:", err);
    } finally {
      setDownloadingIds((prev) => {
        const next = { ...prev };
        delete next[`${video.id}-${type}`];
        return next;
      });
    }
  };

  const fetchTracks = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/tracks/");
      const data = await res.json();
      if (data.tracks) setTracks(data.tracks);
    } catch (err) {
      console.error("Ошибка загрузки треков:", err);
    }
  };

  const fetchImageFiles = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/images/");
      const data = await res.json();
      setImageFiles(data.files || []);
      setImagesDir(data.images_dir || "");
    } catch (err) {
      console.error("Ошибка загрузки изображений:", err);
    }
  };

  const handleDeleteImage = async (filename) => {
    if (!confirm(`Удалить "${filename}" из папки?`)) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/images/${encodeURIComponent(filename)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Ошибка при удалении");
      setImageFiles((prev) => prev.filter((f) => f.filename !== filename));
      if (selectedImage?.filename === filename) setSelectedImage(null);
    } catch (err) {
      alert(`Не удалось удалить: ${err.message}`);
    }
  };

  const handleImagesDirChange = async (newDir) => {
    try {
      const res = await fetch("http://127.0.0.1:8000/images/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images_dir: newDir }),
      });
      if (!res.ok) throw new Error("Ошибка сохранения настроек");
      const data = await res.json();
      setImagesDir(data.images_dir);
      await fetchImageFiles();
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  };

  const convertVideoToAudio = async (videoFilename) => {
    setIsConverting(true);
    
    try {
      const response = await fetch(`http://127.0.0.1:8000/tracks/convert-to-audio/${encodeURIComponent(videoFilename)}`, {
        method: "POST",
      });
      
      if (!response.ok) {
        throw new Error(`Ошибка конвертации: ${response.status}`);
      }
      
      const data = await response.json();
      return data.audio_file;
    } catch (error) {
      console.error("Ошибка конвертации:", error);
      alert(`Не удалось конвертировать видео в аудио: ${error.message}`);
      return null;
    } finally {
      setIsConverting(false);
    }
  };

  const deleteTrack = async (trackName) => {
    if (!confirm(`Вы уверены, что хотите полностью удалить файл "${trackName}" с диска?`)) return;

    try {
      const res = await fetch(`http://127.0.0.1:8000/tracks/${encodeURIComponent(trackName)}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Ошибка при удалении");

      setTracks((prev) => prev.filter((t) => t !== trackName));
      setSavedQuizData((prev) => {
        const updated = { ...prev };
        delete updated[trackName];
        return updated;
      });

      if (currentTrack === trackName) {
        setCurrentTrack("");
        setCurrentAudioTrack("");
        setActiveRegions([]);
        setHasUnsavedChanges(false);
        if (wavesurferRef.current) {
          wavesurferRef.current.empty();
        }
      }

      alert("Файл успешно удален.");
    } catch (err) {
      console.error("Ошибка удаления:", err);
      alert(`Не удалось удалить файл: ${err.message}`);
    }
  };

  const syncRegionsState = () => {
    if (!regionsPluginRef.current) return;
    const wsRegions = regionsPluginRef.current.getRegions();
    const regionsList = wsRegions.map((reg) => ({
      id: reg.id,
      start: reg.start,
      end: reg.end,
      color: reg.color,
    }));
    setActiveRegions(regionsList);
  };

  // Пауза в режиме отрезка — граница конца запоминается для возобновления
  const pauseRegionPlayback = () => {
    if (regionIntervalRef.current) {
      clearInterval(regionIntervalRef.current);
      regionIntervalRef.current = null;
    }
    isPlayingRegionRef.current = false;
    // currentRegionEndRef НЕ сбрасываем — нужен для возобновления
  };

  // Полный выход из режима отрезка — сбрасывает всё состояние
  const clearRegionInterval = () => {
    pauseRegionPlayback();
    currentRegionEndRef.current = null;
  };

  // Запуск интервала-ограничителя конца отрезка
  const startRegionInterval = (end, fileType) => {
    if (regionIntervalRef.current) clearInterval(regionIntervalRef.current);
    isPlayingRegionRef.current = true;
    currentRegionEndRef.current = end;
    regionIntervalRef.current = setInterval(() => {
      const pos = fileType === "video"
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

  const handleDownload = async () => {
    const urlsArray = urlsText.split("\n").map(url => url.trim()).filter(url => url.length > 0);
    if (urlsArray.length === 0) {
      alert("Введите ссылки на YouTube или Spotify");
      return;
    }

    setIsDownloading(true);
    setDownloadProgress({ current: 0, total: urlsArray.length, status: 'downloading' });

    try {
      const response = await fetch("http://127.0.0.1:8000/download/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: urlsArray, download_type: downloadType }),
      });

      if (!response.ok) throw new Error("Ошибка сервера");

      const data = await response.json();
      const downloadedCount = data.downloaded?.length || 0;

      setDownloadProgress({ current: downloadedCount, total: urlsArray.length, status: 'completed' });

      if (downloadedCount > 0) {
        setUrlsText("");
        await fetchTracks();
        alert(`✅ Скачано ${downloadedCount} треков`);
      }

      setTimeout(() => {
        setDownloadProgress({ current: 0, total: 0, status: 'idle' });
      }, 3000);
    } catch (error) {
      console.error("Ошибка:", error);
      alert(`❌ Ошибка: ${error.message}`);
      setDownloadProgress({ current: 0, total: 0, status: 'error' });
    } finally {
      setIsDownloading(false);
    }
  };

  const DownloadProgressBar = ({ progress }) => {
    if (progress.total === 0) return null;
    const percentage = (progress.current / progress.total) * 100;
    return (
      <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#1e293b', borderRadius: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', color: '#94a3b8' }}>
          <span>{progress.status === 'downloading' ? '📥 Скачивание...' : '✅ Завершено!'}</span>
          <span>{progress.current} / {progress.total}</span>
        </div>
        <div style={{ backgroundColor: '#0f172a', borderRadius: '2px', overflow: 'hidden', height: '4px' }}>
          <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: '#3b82f6', transition: 'width 0.3s ease-in-out' }} />
        </div>
      </div>
    );
  };

  // Воспроизведение региона для аудио
  const playRegion = (start, end) => {
    if (!wavesurferRef.current) return;
    clearRegionInterval();
    wavesurferRef.current.setTime(start);
    wavesurferRef.current.play();
    setIsPlaying(true);
    startRegionInterval(end, "audio");
  };

  // Воспроизведение региона для видео
  const playVideoRegion = (start, end) => {
    if (!videoRef.current) return;
    clearRegionInterval();
    videoRef.current.currentTime = start;
    videoRef.current.play();
    setIsPlaying(true);
    startRegionInterval(end, "video");
  };

  // Единая точка управления воспроизведением.
  // Три режима: играет отрезок → пауза (граница сохраняется);
  //             на паузе после отрезка → возобновление с той же границей;
  //             свободное воспроизведение → обычный toggle.
  const togglePlay = () => {
    if (isPlayingRegionRef.current) {
      // Пауза во время отрезка — сохраняем currentRegionEndRef для возобновления
      pauseRegionPlayback();
      if (currentFileType === "video" && videoRef.current) videoRef.current.pause();
      else if (wavesurferRef.current) wavesurferRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (currentRegionEndRef.current !== null) {
      // Возобновление после паузы в отрезке — восстанавливаем границу
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

    // Свободное воспроизведение
    if (currentFileType === "video") {
      if (videoRef.current) {
        if (videoRef.current.paused) { videoRef.current.play(); setIsPlaying(true); }
        else { videoRef.current.pause(); setIsPlaying(false); }
      }
    } else {
      if (wavesurferRef.current) wavesurferRef.current.playPause();
    }
  };
  togglePlayRef.current = togglePlay; // обновляем ref при каждом рендере

  const handleVideoSeeking = () => {
    // Только сбрасываем флаг; синхронизацию WS делаем в onSeeked после завершения seek.
    if (isSeekingFromWSRef.current) {
      isSeekingFromWSRef.current = false;
      return;
    }
    // Внешний seek (нативные controls) — WS синхронизируется в onSeeked.
  };

  const handleVideoSeeked = () => {
    const finalTime = videoRef.current?.currentTime ?? 0;
    if (wavesurferRef.current) {
      wavesurferRef.current.setTime(finalTime);
    }
    setCurrentTime(finalTime);
  };

  // Обновление времени (только для отображения)
  const handleVideoTimeUpdate = () => {
    if (!videoRef.current) return;
    if (videoRef.current.seeking) return;

    const videoTime = videoRef.current.currentTime;
    setCurrentTime(videoTime);

    // Синхронизируем позицию WaveSurfer с видео
    if (wavesurferRef.current) {
      const wsTime = wavesurferRef.current.getCurrentTime();
      if (Math.abs(videoTime - wsTime) > 0.1) {
        wavesurferRef.current.setTime(videoTime);
      }
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    clearRegionInterval();
  };


  // Инициализация WaveSurfer
  useEffect(() => {
    if (!currentTrack) return;
    if (!containerRef.current) return;

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
          const convertedAudio = await convertVideoToAudio(currentTrack);
          if (convertedAudio) {
            setCurrentAudioTrack(convertedAudio);
            audioFile = convertedAudio;
            // videoRef.current.load() здесь не нужен: все MP4 на диске уже имеют
            // faststart (moov в начале файла). load() только сбрасывал уже начавшуюся
            // загрузку видео и вынуждал браузер качать заново — из-за этого seekable
            // оставался 0-0 к моменту готовности WaveSurfer.
          } else {
            if (containerRef.current) {
              containerRef.current.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;">❌ Не удалось конвертировать видео в аудио</div>';
            }
            return;
          }
        }

        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        if (!containerRef.current) return;

        // Создаем отдельный аудиоэлемент только для WaveSurfer
        const audioElement = new Audio();
        audioElement.crossOrigin = "anonymous";
        audioElement.src = `http://127.0.0.1:8000/audio/${encodeURIComponent(audioFile)}`;
        audioElement.preload = 'metadata';
        // Для видео-файлов глушим audio element WaveSurfer'а — звук идёт из <video>,
        // а аудио-элемент нужен только для отрисовки волны и позиции курсора.
        if (fileType === "video") {
          audioElement.muted = true;
        }
        audioElementRef.current = audioElement;
        
        await new Promise((resolve, reject) => {
          audioElement.addEventListener('loadedmetadata', resolve);
          audioElement.addEventListener('error', reject);
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
            // Для видео-файлов WaveSurfer используется только для визуализации.
            // Сразу останавливаем audio element — позиция курсора управляется
            // через ws.setTime() из интервала синхронизации с видео.
            ws.pause();
            return;
          }
          setIsPlaying(true);
        });

        ws.on("pause", () => {
          if (fileType !== "video") {
            setIsPlaying(false);
          }
        });
        
        ws.on("finish", () => {
          if (fileType !== "video") {
            setIsPlaying(false);
          }
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
              color: seg.type === "question" ? "rgba(59, 130, 246, 0.3)" : "rgba(16, 185, 129, 0.3)",
              drag: true,
              resize: true,
            });
          });
          syncRegionsState();
          setTimeout(() => {
            isInitialLoadingRef.current = false;
            setHasUnsavedChanges(false);
          }, 100);
        });
        
        ws.on("error", (error) => {
          console.error("WaveSurfer error:", error);
        });
        
        ws.on("timeupdate", (time) => {
          if (fileType !== "video") {
            setCurrentTime(time);
          }
        });

        regions.on("region-update", () => {
          syncRegionsState();
          if (!isInitialLoadingRef.current) setHasUnsavedChanges(true);
        });
        regions.on("region-updated", () => syncRegionsState());
        regions.on("region-created", () => {
          syncRegionsState();
          if (!isInitialLoadingRef.current) setHasUnsavedChanges(true);
        });
        regions.on("region-removed", () => {
          syncRegionsState();
          if (!isInitialLoadingRef.current) setHasUnsavedChanges(true);
        });

        ws.on("interaction", (newTime) => {
          if (regionClickedRef.current) return;

          const seekTime = typeof newTime === "number" ? newTime : ws.getCurrentTime();
          const wasPlaying = fileType === "video"
            ? !!videoRef.current && !videoRef.current.paused
            : ws.isPlaying();

          if (fileType === "video" && videoRef.current) {
            clearRegionInterval();
            isSeekingFromWSRef.current = true; // помечаем: этот seek — наш, не синхронизировать обратно
            videoRef.current.currentTime = seekTime;
            setCurrentTime(seekTime);
            if (wasPlaying) {
              videoRef.current.play();
              setIsPlaying(true);
            }
          } else {
            clearRegionInterval();
            setCurrentTime(seekTime);
            if (wasPlaying) {
              ws.play();
              setIsPlaying(true);
            }
          }
        });

        regions.on("region-click", (region, e) => {
          e.stopPropagation();
          regionClickedRef.current = true;
          setTimeout(() => { regionClickedRef.current = false; }, 0);
          if (fileType === "video") {
            playVideoRegion(region.start, region.end);
          } else {
            playRegion(region.start, region.end);
          }
        });
        
      } catch (error) {
        console.error("Ошибка при инициализации плеера:", error);
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div style="text-align: center; padding: 40px; color: #ef4444;">❌ Ошибка загрузки: ${error.message}</div>`;
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
        audioElementRef.current.src = '';
        audioElementRef.current = null;
      }
    };
  }, [currentTrack]); // savedQuizData намеренно убран — используем ref, чтобы не пересоздавать плеер при удалении зафиксированных отрезков

  // Очистка интервала при размонтировании
  useEffect(() => {
    return () => {
      clearRegionInterval();
    };
  }, []);

  // Очистка при смене трека
  useEffect(() => {
    clearRegionInterval();
    setIsPlaying(false);
    if (wavesurferRef.current) {
      wavesurferRef.current.pause();
    }
  }, [currentTrack]);

  // Пробел — делегируем в togglePlayRef, который всегда актуален
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== "Space") return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      e.preventDefault();
      togglePlayRef.current?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []); // зависимостей нет — логика живёт в ref

  // Отдельный эффект для обновления времени видео
  useEffect(() => {
    if (currentFileType !== "video") return;
    if (!videoRef.current) return;
    if (!wavesurferRef.current) return;
    
    let syncInterval = null;
    
    const startSync = () => {
      if (syncInterval) clearInterval(syncInterval);
      syncInterval = setInterval(() => {
        if (videoRef.current && wavesurferRef.current && !videoRef.current.paused && !videoRef.current.seeking) {
          const videoTime = videoRef.current.currentTime;
          const wsTime = wavesurferRef.current.getCurrentTime();
          
          if (Math.abs(videoTime - wsTime) > 0.1) {
            console.log("[SyncInterval] Syncing WaveSurfer to:", videoTime, "from:", wsTime);
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
    
    if (!videoRef.current.paused) {
      startSync();
    }
    
    const handlePlay = () => startSync();
    const handlePause = () => stopSync();
    // seeking удалён — обрабатывается через onSeeking/onSeeked на JSX элементе <video>.
    // Два обработчика (React capture + native addEventListener) потребляли флаг isSeekingFromWSRef раньше другого.
    
    videoRef.current.addEventListener('play', handlePlay);
    videoRef.current.addEventListener('pause', handlePause);
    
    return () => {
      stopSync();
      if (videoRef.current) {
        videoRef.current.removeEventListener('play', handlePlay);
        videoRef.current.removeEventListener('pause', handlePause);
      }
    };
  }, [currentFileType, currentTrack]);

  const addQuestionRegion = () => {
    if (!wavesurferRef.current || !regionsPluginRef.current) return;
    const currentTime = wavesurferRef.current.getCurrentTime();
    const duration = wavesurferRef.current.getDuration();
    const end = Math.min(currentTime + 5, duration);

    regionsPluginRef.current.addRegion({
      start: currentTime,
      end: end,
      color: "rgba(59, 130, 246, 0.3)",
      drag: true,
      resize: true,
    });
  };

  const addAnswerRegion = () => {
    if (!wavesurferRef.current || !regionsPluginRef.current) return;
    const currentTime = wavesurferRef.current.getCurrentTime();
    const duration = wavesurferRef.current.getDuration();
    const end = Math.min(currentTime + 5, duration);

    regionsPluginRef.current.addRegion({
      start: currentTime,
      end: end,
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

    let qCount = 0, aCount = 0;
    const formattedSegments = sorted.map((reg) => {
      const isQuestion = reg.color.includes("59, 130, 246");
      if (isQuestion) qCount++; else aCount++;

      const defaultLabel = isQuestion
        ? `${currentTrack.replace(/\.[^/.]+$/, "")} вопрос ${qCount}`
        : `${currentTrack.replace(/\.[^/.]+$/, "")} ответ ${aCount}`;

      const userLabel = prompt(`Введите название для отрезка:`, defaultLabel);
      return {
        id: reg.id,
        start: reg.start,
        end: reg.end,
        type: isQuestion ? "question" : "answer",
        label: userLabel?.trim() || defaultLabel,
      };
    });

    setSavedQuizData((prev) => ({ ...prev, [currentTrack]: formattedSegments }));
    setHasUnsavedChanges(false);
    alert("Отрезки успешно зафиксированы!");
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

  const handleExportAll = async () => {
    const hasSegments = Object.keys(savedQuizData).some(
      (trackName) => savedQuizData[trackName] && savedQuizData[trackName].length > 0
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
          label: seg.label || ""
        });
      });
    });

    try {
      const res = await fetch("http://127.0.0.1:8000/export/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: flatSegments }),
      });
      
      if (res.ok) {
        setSavedQuizData({});
        alert("✅ Проект успешно экспортирован!");
      } else {
        alert(`❌ Ошибка: ${res.status}`);
      }
    } catch (err) {
      console.error("Ошибка:", err);
      alert("❌ Не удалось связаться с сервером.");
    } finally {
      setIsExporting(false);
    }
  };

  const hasAnySavedSegments = Object.keys(savedQuizData).length > 0;

  useEffect(() => {
    if (mainTab === "images") fetchImageFiles();
  }, [mainTab]);

  return (
    <div style={{ display: "flex", height: "100vh", backgroundColor: "#0f172a", color: "#e2e8f0", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      
      {/* Левая колонка */}
      <div style={{ width: "300px", borderRight: "1px solid #334155", backgroundColor: "#1e293b", display: "flex", flexDirection: "column" }}>

        {/* Главные вкладки: Медиа / Изображения */}
        <div style={{ display: "flex", flexShrink: 0, borderBottom: "2px solid #0f172a" }}>
          {[["media", "🎵 Медиа"], ["images", "🖼 Изображения"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMainTab(id)}
              style={{
                flex: 1, padding: "11px 0", border: "none", cursor: "pointer",
                fontSize: "12px", fontWeight: "600",
                backgroundColor: mainTab === id ? "#0f172a" : "#1e293b",
                color: mainTab === id ? "#f1f5f9" : "#64748b",
                borderBottom: mainTab === id ? "2px solid #3b82f6" : "2px solid transparent",
              }}
            >{label}</button>
          ))}
        </div>

        {/* ── Вкладка: Изображения ── */}
        {mainTab === "images" && (
          <ImageLibrary
            imagesDir={imagesDir}
            imageFiles={imageFiles}
            selectedImage={selectedImage}
            onSelectImage={handleSelectImage}
            onDeleteImage={handleDeleteImage}
            onDirChange={handleImagesDirChange}
            onRefresh={fetchImageFiles}
          />
        )}

        {/* ── Вкладка: Медиа (весь существующий контент) ── */}
        {mainTab === "media" && <>

        {/* Вкладки: Поиск / По ссылке */}
        <div style={{ borderBottom: "1px solid #334155" }}>
          <div style={{ display: "flex" }}>
            {[["search", "🔍 Поиск"], ["url", "🔗 По ссылке"]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setLeftTab(id)}
                style={{
                  flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
                  fontSize: "12px", fontWeight: "500",
                  backgroundColor: leftTab === id ? "#0f172a" : "#1e293b",
                  color: leftTab === id ? "#f1f5f9" : "#64748b",
                  borderBottom: leftTab === id ? "2px solid #3b82f6" : "2px solid transparent",
                }}
              >{label}</button>
            ))}
          </div>

          {/* Вкладка: Поиск */}
          {leftTab === "search" && (
            <div style={{ padding: "12px" }}>
              {/* Переключатель YouTube / Spotify */}
              <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
                {[["youtube", "▶ YouTube"], ["spotify", "🎧 Spotify"]].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => { setSearchSource(id); setSearchResults([]); setSearchError(null); }}
                    style={{
                      flex: 1, padding: "5px 0", border: "none", cursor: "pointer",
                      borderRadius: "4px", fontSize: "11px", fontWeight: "600",
                      backgroundColor: searchSource === id
                        ? (id === "spotify" ? "rgba(29,185,84,0.25)" : "rgba(59,130,246,0.25)")
                        : "#0f172a",
                      color: searchSource === id
                        ? (id === "spotify" ? "#4ade80" : "#93c5fd")
                        : "#475569",
                      outline: searchSource === id
                        ? `1px solid ${id === "spotify" ? "#4ade80" : "#3b82f6"}`
                        : "1px solid #334155",
                    }}
                  >{label}</button>
                ))}
              </div>
              <form onSubmit={handleSearch} style={{ display: "flex", gap: "6px" }}>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchSource === "spotify" ? "Исполнитель, трек..." : "Поиск на YouTube..."}
                  style={{ flex: 1, padding: "7px 10px", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #475569", color: "#e2e8f0", fontSize: "12px" }}
                />
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  style={{ padding: "7px 12px", borderRadius: "4px", border: "none", backgroundColor: searchSource === "spotify" ? "#1db954" : "#3b82f6", color: "#fff", fontSize: "13px", cursor: "pointer" }}
                >{isSearching ? "⏳" : "🔍"}</button>
              </form>
            </div>
          )}

          {/* Вкладка: По ссылке */}
          {leftTab === "url" && (
            <div style={{ padding: "12px" }}>
              <textarea
                rows={3}
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                placeholder={"Вставьте ссылки (каждая с новой строки):\n• YouTube: youtube.com/...\n• Spotify: open.spotify.com/track/..."}
                style={{ width: "100%", padding: "8px", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #475569", color: "#e2e8f0", fontSize: "12px", fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" }}
                disabled={isDownloading}
              />
              {/* Подсказка если есть Spotify ссылки */}
              {urlsText.split("\n").some(u => u.includes("open.spotify.com/track/")) && (
                <div style={{ marginTop: "6px", padding: "5px 8px", backgroundColor: "rgba(29,185,84,0.12)", border: "1px solid rgba(29,185,84,0.4)", borderRadius: "4px", fontSize: "11px", color: "#4ade80" }}>
                  🎧 Spotify → всегда скачивается как MP3
                </div>
              )}
              {/* Селектор формата — только если нет чисто Spotify строк */}
              {!urlsText.split("\n").every(u => u.trim() === "" || u.includes("open.spotify.com/track/")) && (
                <select
                  value={downloadType}
                  onChange={(e) => setDownloadType(e.target.value)}
                  disabled={isDownloading}
                  style={{ width: "100%", marginTop: "8px", padding: "6px 8px", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #475569", color: "#e2e8f0", fontSize: "12px" }}
                >
                  <option value="audio">🎵 Аудио (MP3)</option>
                  <option value="video">🎬 Видео (MP4)</option>
                  <option value="ogg">📎 Аудио OGG — для LibreOffice</option>
                  <option value="ogv">📎 Видео OGV — для LibreOffice</option>
                </select>
              )}
              <button
                onClick={handleDownload}
                disabled={isDownloading || !urlsText.trim()}
                style={{ width: "100%", marginTop: "8px", padding: "8px", borderRadius: "4px", border: "none", backgroundColor: isDownloading ? "#475569" : "#3b82f6", color: "#fff", fontSize: "13px", fontWeight: "500", cursor: isDownloading ? "not-allowed" : "pointer" }}
              >
                {isDownloading ? "⏳ Скачивание..." : "⬇️ Скачать файлы"}
              </button>
              <DownloadProgressBar progress={downloadProgress} />
            </div>
          )}
        </div>

        {/* Результаты поиска */}
        {leftTab === "search" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
            {isSearching && (
              <p style={{ color: "#64748b", fontSize: "12px", textAlign: "center", padding: "16px 0" }}>🔍 Поиск...</p>
            )}
            {!isSearching && searchError && (
              <div style={{ color: "#f87171", fontSize: "12px", padding: "10px 8px", background: "#1e1b1b", borderRadius: "6px", margin: "8px 0", lineHeight: "1.5" }}>
                ⚠️ {searchError}
              </div>
            )}
            {!isSearching && !searchError && searchResults.length === 0 && searchQuery && (
              <p style={{ color: "#64748b", fontSize: "12px", textAlign: "center", padding: "16px 0" }}>Ничего не найдено</p>
            )}
            {!isSearching && !searchError && searchResults.length === 0 && !searchQuery && (
              <p style={{ color: "#475569", fontSize: "12px", textAlign: "center", padding: "16px 0" }}>Введите запрос для поиска</p>
            )}

            {/* ── Результаты YouTube ── */}
            {searchSource === "youtube" && searchResults.map((video) => {
              const loadingAudio = downloadingIds[`${video.id}-audio`];
              const loadingVideo = downloadingIds[`${video.id}-video`];
              const loadingOgg = downloadingIds[`${video.id}-ogg`];
              const isPreviewing = previewVideo?.id === video.id;
              return (
                <div
                  key={video.id}
                  style={{ display: "flex", gap: "8px", padding: "8px 0", borderBottom: "1px solid #1e293b", alignItems: "flex-start", backgroundColor: isPreviewing ? "rgba(59,130,246,0.07)" : "transparent", borderRadius: "4px" }}
                >
                  <img
                    src={video.thumbnail}
                    alt=""
                    onClick={() => { setPreviewVideo(video); setCurrentTrack(""); }}
                    style={{ width: "72px", height: "40px", objectFit: "cover", borderRadius: "3px", flexShrink: 0, backgroundColor: "#0f172a", cursor: "pointer", outline: isPreviewing ? "2px solid #3b82f6" : "none" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      onClick={() => { setPreviewVideo(video); setCurrentTrack(""); }}
                      style={{ fontSize: "11px", color: isPreviewing ? "#93c5fd" : "#e2e8f0", lineHeight: "1.3", marginBottom: "3px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", cursor: "pointer" }}
                    >
                      {video.title}
                    </div>
                    <div style={{ fontSize: "10px", color: "#64748b" }}>
                      {video.channel}{video.duration ? ` · ${formatDuration(video.duration)}` : ""}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "5px" }}>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          onClick={() => downloadFromSearch(video, "audio")}
                          disabled={!!loadingAudio || !!loadingVideo || !!loadingOgg || !!downloadingIds[`${video.id}-ogv`]}
                          title="Скачать аудио (MP3)"
                          style={{ flex: 1, padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6", backgroundColor: "rgba(59,130,246,0.15)", color: "#93c5fd", cursor: "pointer" }}
                        >{loadingAudio ? "⏳" : "🎵 MP3"}</button>
                        <button
                          onClick={() => downloadFromSearch(video, "video")}
                          disabled={!!loadingAudio || !!loadingVideo || !!loadingOgg || !!downloadingIds[`${video.id}-ogv`]}
                          title="Скачать видео (MP4)"
                          style={{ flex: 1, padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #10b981", backgroundColor: "rgba(16,185,129,0.15)", color: "#6ee7b7", cursor: "pointer" }}
                        >{loadingVideo ? "⏳" : "🎬 MP4"}</button>
                      </div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          onClick={() => downloadFromSearch(video, "ogg")}
                          disabled={!!loadingAudio || !!loadingVideo || !!loadingOgg || !!downloadingIds[`${video.id}-ogv`]}
                          title="Скачать аудио OGG (для LibreOffice)"
                          style={{ flex: 1, padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #f59e0b", backgroundColor: "rgba(245,158,11,0.15)", color: "#fcd34d", cursor: "pointer" }}
                        >{loadingOgg ? "⏳" : "📎 OGG"}</button>
                        <button
                          onClick={() => downloadFromSearch(video, "ogv")}
                          disabled={!!loadingAudio || !!loadingVideo || !!loadingOgg || !!downloadingIds[`${video.id}-ogv`]}
                          title="Скачать видео OGV (для LibreOffice)"
                          style={{ flex: 1, padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #a78bfa", backgroundColor: "rgba(167,139,250,0.15)", color: "#c4b5fd", cursor: "pointer" }}
                        >{downloadingIds[`${video.id}-ogv`] ? "⏳" : "📎 OGV"}</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* ── Результаты Spotify ── */}
            {searchSource === "spotify" && searchResults.map((track) => {
              const isLoading = !!downloadingIds[`${track.id}-spotify`];
              return (
                <div
                  key={track.id}
                  style={{ display: "flex", gap: "8px", padding: "8px 0", borderBottom: "1px solid #1e293b", alignItems: "center" }}
                >
                  {/* Обложка альбома */}
                  <img
                    src={track.thumbnail}
                    alt=""
                    style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "4px", flexShrink: 0, backgroundColor: "#0f172a" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "11px", color: "#e2e8f0", lineHeight: "1.3", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {track.title}
                    </div>
                    <div style={{ fontSize: "10px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {track.artists}{track.duration ? ` · ${formatDuration(track.duration)}` : ""}
                    </div>
                    <button
                      onClick={() => {
                        setDownloadingIds((prev) => ({ ...prev, [`${track.id}-spotify`]: true }));
                        fetch("http://127.0.0.1:8000/download/", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ urls: [track.url], download_type: "audio" }),
                        })
                          .then((r) => r.json())
                          .then((data) => { if (data.downloaded?.length > 0) fetchTracks(); })
                          .catch(console.error)
                          .finally(() => setDownloadingIds((prev) => { const n = { ...prev }; delete n[`${track.id}-spotify`]; return n; }));
                      }}
                      disabled={isLoading}
                      style={{ marginTop: "4px", padding: "2px 8px", fontSize: "10px", borderRadius: "3px", border: "1px solid #1db954", backgroundColor: "rgba(29,185,84,0.15)", color: "#4ade80", cursor: isLoading ? "not-allowed" : "pointer" }}
                    >{isLoading ? "⏳ Скачивание..." : "⬇️ Скачать MP3"}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Список файлов — только на вкладке «По ссылке» или всегда снизу */}
        <div style={{ flex: leftTab === "url" ? 1 : 0, overflowY: "auto", padding: "12px", borderTop: leftTab === "search" && searchResults.length > 0 ? "1px solid #334155" : "none", maxHeight: leftTab === "search" ? "220px" : undefined }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "12px", fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>Доступные файлы</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {tracks.map((track) => {
              const savedCount = savedQuizData[track]?.length || 0;
              const isSelected = currentTrack === track;
              const fileType = getFileType(track);
              
              return (
                <li
                  key={track}
                  onClick={() => {
                    if (isSelected) return;
                    if (hasUnsavedChanges && !confirm("Переключить трек без сохранения?")) return;
                    setCurrentTrack(track);
                    setPreviewVideo(null);
                  }}
                  style={{
                    padding: "6px 8px",
                    borderRadius: "4px",
                    backgroundColor: isSelected ? "#334155" : "transparent",
                    cursor: "pointer",
                    marginBottom: "2px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px",
                    transition: "background-color 0.2s",
                  }}
                >
                  <span style={{ color: isSelected ? "#fff" : "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {fileType === "audio" ? "🎵" : "🎬"} {track}
                  </span>
                  <div style={{ display: "flex", gap: "6px", marginLeft: "8px" }}>
                    {savedCount > 0 && (
                      <span style={{ backgroundColor: "#10b981", padding: "2px 5px", borderRadius: "10px", fontSize: "10px", fontWeight: "500" }}>{savedCount}</span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); deleteTrack(track); }} style={{ background: "transparent", border: "none", cursor: "pointer", opacity: 0.5, color: "#cbd5e1", fontSize: "12px" }}>🗑️</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        </>}
      </div>

      {/* Правая колонка */}
      {mainTab === "images" ? (
        <ImageEditor
          image={selectedImage}
          imagesDir={imagesDir}
          onClose={() => { setSelectedImage(null); imageEditorDirtyRef.current=false; }}
          onRefresh={fetchImageFiles}
          onSelectImage={handleSelectImage}
          onDirtyChange={(d) => { imageEditorDirtyRef.current = d; }}
        />
      ) : currentTrack ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #334155", backgroundColor: "#1e293b" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "500", color: "#f1f5f9" }}>
                {currentFileType === "audio" ? "🎵" : "🎬"} {currentTrack}
              </h2>
              <button
                onClick={handleExportAll}
                disabled={!hasAnySavedSegments || isExporting}
                style={{ 
                  padding: "6px 12px", 
                  borderRadius: "4px", 
                  border: "none", 
                  backgroundColor: !hasAnySavedSegments ? "#475569" : "#10b981", 
                  color: "#fff", 
                  fontSize: "12px", 
                  fontWeight: "500", 
                  cursor: !hasAnySavedSegments || isExporting ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                {isExporting ? "⏳ Экспорт..." : "🚀 Экспорт"}
              </button>
            </div>

            {/* Видео плеер (только для видео) */}
            {currentFileType === "video" && (
              <div style={{ marginBottom: "16px" }}>
                <video
                  ref={videoRef}
                  crossOrigin="anonymous"
                  src={`http://127.0.0.1:8000/audio/${encodeURIComponent(currentTrack)}`}
                  controls
                  onTimeUpdate={handleVideoTimeUpdate}
                  onSeeking={handleVideoSeeking}
                  onSeeked={handleVideoSeeked}
                  onEnded={handleVideoEnded}
                  onPlay={() => {
                    // Не сбрасываем интервал если воспроизводим регион —
                    // иначе событие play уничтожит boundary-check сразу после его создания
                    if (!isPlayingRegionRef.current) {
                      clearRegionInterval();
                    }
                    setIsPlaying(true);
                  }}
                  onPause={() => setIsPlaying(false)}
                  style={{ width: "100%", maxHeight: "360px", backgroundColor: "#000", borderRadius: "8px" }}
                />
              </div>
            )}

            {/* Контейнер для волны */}
            {isConverting ? (
              <div style={{ textAlign: "center", padding: "30px", backgroundColor: "#1e293b", borderRadius: "8px" }}>
                <p style={{ fontSize: "13px", color: "#94a3b8" }}>🔄 Конвертация видео в аудио для визуализации...</p>
              </div>
            ) : (
              <div 
                key={currentTrack}
                ref={containerRef} 
                style={{ backgroundColor: "#0f172a", borderRadius: "8px", padding: "8px", border: "1px solid #334155", marginBottom: "16px" }} 
              />
            )}

            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={togglePlay} style={{ padding: "6px 14px", borderRadius: "4px", border: "none", backgroundColor: isPlaying ? "#ef4444" : "#3b82f6", color: "#fff", fontSize: "13px", fontWeight: "500", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                {isPlaying ? "⏸ Пауза" : "▶ Пуск"}
              </button>
              
              <div style={{ fontFamily: "monospace", fontSize: "13px", backgroundColor: "#f1f5f9", color: "#1e293b", padding: "4px 10px", borderRadius: "4px" }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
              
              <button onClick={addQuestionRegion} style={{ padding: "6px 12px", borderRadius: "4px", border: "1px solid #3b82f6", backgroundColor: "rgba(59, 130, 246, 0.15)", color: "#93c5fd", fontSize: "12px", fontWeight: "500", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                🔵 Вопрос
              </button>

              <button onClick={addAnswerRegion} style={{ padding: "6px 12px", borderRadius: "4px", border: "1px solid #10b981", backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#6ee7b7", fontSize: "12px", fontWeight: "500", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                🟢 Ответ
              </button>

              <button onClick={saveCurrentTrackSegments} style={{ padding: "6px 12px", borderRadius: "4px", border: "none", backgroundColor: "#e2e8f0", color: "#1e293b", fontSize: "12px", fontWeight: "500", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                💾 Сохранить
              </button>
            </div>
            {hasUnsavedChanges && (
              <p style={{ color: "#f59e0b", fontSize: "11px", marginTop: "8px" }}>⚠️ Есть несохраненные маркеры</p>
            )}
          </div>

          <div style={{ padding: "20px 24px" }}>
            {/* Список регионов */}
            <div style={{ backgroundColor: "#1e293b", padding: "16px", borderRadius: "8px", marginBottom: "20px" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>⏳ Текущие регионы</h3>
              {activeRegions.length > 0 ? (
                activeRegions.map((reg) => {
                  const isQuestion = reg.color.includes("59, 130, 246");
                  return (
                    <div key={reg.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", backgroundColor: "#0f172a", borderRadius: "6px", marginBottom: "8px", borderLeft: isQuestion ? "3px solid #3b82f6" : "3px solid #10b981" }}>
                      <div style={{ fontSize: "12px" }}>
                        <strong style={{ color: isQuestion ? "#60a5fa" : "#34d399" }}>[{isQuestion ? "Вопрос" : "Ответ"}]</strong>
                        <span style={{ marginLeft: "8px", color: "#cbd5e1" }}>{reg.start.toFixed(1)}с — {reg.end.toFixed(1)}с ({(reg.end - reg.start).toFixed(1)}с)</span>
                      </div>
                      <div>
                        <button 
                          onClick={() => {
                            if (currentFileType === "video") {
                              playVideoRegion(reg.start, reg.end);
                            } else {
                              playRegion(reg.start, reg.end);
                            }
                          }} 
                          style={{ padding: "3px 8px", backgroundColor: "rgba(59, 130, 246, 0.2)", border: "1px solid #3b82f6", color: "#93c5fd", borderRadius: "4px", cursor: "pointer", marginRight: "6px", fontSize: "11px" }}
                        >
                          ▶
                        </button>
                        <button onClick={() => removeTimelineRegion(reg.id)} style={{ padding: "3px 6px", backgroundColor: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: "4px", cursor: "pointer", fontSize: "11px" }}>🗑</button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p style={{ color: "#64748b", fontSize: "12px", margin: 0 }}>Нет выделенных областей. Добавьте "Вопрос" или "Ответ".</p>
              )}
            </div>

            {/* Сохраненные данные */}
            <div style={{ backgroundColor: "#1e293b", padding: "16px", borderRadius: "8px" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>📦 Зафиксированные отрезки</h3>
              {hasAnySavedSegments ? (
                Object.keys(savedQuizData).map((trackName) => (
                  <div key={trackName} style={{ backgroundColor: "#0f172a", padding: "10px", borderRadius: "6px", marginBottom: "10px" }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "#38bdf8", marginBottom: "6px" }}>📁 {trackName}</div>
                    {savedQuizData[trackName].map((seg, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #334155", fontSize: "11px" }}>
                        <span>
                          <strong style={{ color: seg.type === "question" ? "#60a5fa" : "#34d399" }}>[{seg.type === "question" ? "Вопрос" : "Ответ"}]</strong>
                          {" "}{seg.label} ({seg.start.toFixed(1)}с - {seg.end.toFixed(1)}с)
                        </span>
                        <button onClick={() => deleteSavedSegment(trackName, seg.id)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "11px" }}>❌</button>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <p style={{ color: "#64748b", fontSize: "12px", margin: 0 }}>Нет зафиксированных данных. Сохраните отрезки для трека.</p>
              )}
            </div>
          </div>
        </div>
      ) : previewVideo ? (
        /* Превью результата поиска */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "#0f172a" }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #334155", backgroundColor: "#1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: "0 0 2px 0", fontSize: "15px", fontWeight: "500", color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                ▶ {previewVideo.title}
              </h2>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                {previewVideo.channel}{previewVideo.duration ? ` · ${formatDuration(previewVideo.duration)}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexShrink: 0, marginLeft: "16px" }}>
              <button
                onClick={() => downloadFromSearch(previewVideo, "audio")}
                disabled={!!downloadingIds[`${previewVideo.id}-audio`] || !!downloadingIds[`${previewVideo.id}-video`]}
                style={{ padding: "6px 14px", borderRadius: "4px", border: "1px solid #3b82f6", backgroundColor: "rgba(59,130,246,0.15)", color: "#93c5fd", fontSize: "12px", fontWeight: "500", cursor: "pointer" }}
              >{downloadingIds[`${previewVideo.id}-audio`] ? "⏳ Скачивание..." : "🎵 Скачать MP3"}</button>
              <button
                onClick={() => downloadFromSearch(previewVideo, "video")}
                disabled={!!downloadingIds[`${previewVideo.id}-audio`] || !!downloadingIds[`${previewVideo.id}-video`]}
                style={{ padding: "6px 14px", borderRadius: "4px", border: "1px solid #10b981", backgroundColor: "rgba(16,185,129,0.15)", color: "#6ee7b7", fontSize: "12px", fontWeight: "500", cursor: "pointer" }}
              >{downloadingIds[`${previewVideo.id}-video`] ? "⏳ Скачивание..." : "🎬 Скачать MP4"}</button>
              <button
                onClick={() => downloadFromSearch(previewVideo, "ogg")}
                disabled={!!downloadingIds[`${previewVideo.id}-audio`] || !!downloadingIds[`${previewVideo.id}-video`] || !!downloadingIds[`${previewVideo.id}-ogg`]}
                title="Скачать аудио OGG (для LibreOffice)"
                style={{ padding: "6px 14px", borderRadius: "4px", border: "1px solid #f59e0b", backgroundColor: "rgba(245,158,11,0.15)", color: "#fcd34d", fontSize: "12px", fontWeight: "500", cursor: "pointer" }}
              >{downloadingIds[`${previewVideo.id}-ogg`] ? "⏳ Скачивание..." : "📎 Скачать OGG"}</button>
              <button
                onClick={() => downloadFromSearch(previewVideo, "ogv")}
                disabled={!!downloadingIds[`${previewVideo.id}-audio`] || !!downloadingIds[`${previewVideo.id}-video`] || !!downloadingIds[`${previewVideo.id}-ogv`]}
                title="Скачать видео OGV (для LibreOffice)"
                style={{ padding: "6px 14px", borderRadius: "4px", border: "1px solid #a78bfa", backgroundColor: "rgba(167,139,250,0.15)", color: "#c4b5fd", fontSize: "12px", fontWeight: "500", cursor: "pointer" }}
              >{downloadingIds[`${previewVideo.id}-ogv`] ? "⏳ Скачивание..." : "📎 Скачать OGV"}</button>
              <button
                onClick={() => setPreviewVideo(null)}
                style={{ padding: "6px 10px", borderRadius: "4px", border: "none", backgroundColor: "transparent", color: "#64748b", fontSize: "16px", cursor: "pointer" }}
                title="Закрыть"
              >✕</button>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "24px" }}>
            <iframe
              key={previewVideo.id}
              src={`https://www.youtube.com/embed/${previewVideo.id}?autoplay=1`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", maxWidth: "900px", aspectRatio: "16/9", border: "none", borderRadius: "8px", backgroundColor: "#000" }}
            />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", color: "#64748b" }}>
          <p style={{ fontSize: "14px" }}>🎬 Выберите трек из списка или найдите видео через поиск</p>
        </div>
      )}
    </div>
  );
}
