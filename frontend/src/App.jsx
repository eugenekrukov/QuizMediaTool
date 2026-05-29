import { useEffect, useState } from "react";
import ImageLibrary from "./ImageLibrary";
import ImageEditor from "./ImageEditor";
import DownloadProgressBar from "./components/DownloadProgressBar";
import { useTracks } from "./hooks/useTracks";
import { useMediaPlayer } from "./hooks/useMediaPlayer";
import { useSearch } from "./hooks/useSearch";
import { useDownload } from "./hooks/useDownload";
import { useImages } from "./hooks/useImages";
import { useQuizData } from "./hooks/useQuizData";
import { formatTime, formatDuration, getFileType } from "./utils";
import { deleteTrackAPI } from "./api";

export default function App() {
  // ── Навигация ─────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState("media"); // "media" | "images"
  const [leftTab, setLeftTab] = useState("search"); // "search" | "url"

  // ── Хуки ─────────────────────────────────────────────────────────────────
  const {
    tracks,
    setTracks,
    currentTrack,
    setCurrentTrack,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    fetchTracks,
  } = useTracks();

  const {
    savedQuizData,
    setSavedQuizData,
    isExporting,
    setTrackSegments,
    deleteSavedSegment,
    deleteTrackQuizData,
    handleExportAll,
    hasAnySavedSegments,
  } = useQuizData();

  const {
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
  } = useMediaPlayer({
    savedQuizData,
    onSavedQuizData: setTrackSegments,
    currentTrack,
    onHasUnsavedChanges: setHasUnsavedChanges,
  });

  const {
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
  } = useSearch({ onTracksRefresh: fetchTracks });

  const {
    urlsText,
    setUrlsText,
    isDownloading,
    downloadType,
    setDownloadType,
    downloadProgress,
    handleDownload,
  } = useDownload({ onTracksRefresh: fetchTracks });

  const {
    imagesDir,
    imageFiles,
    selectedImage,
    imageEditorDirtyRef,
    fetchImageFiles,
    handleSelectImage,
    handleDeleteImage,
    handleImagesDirChange,
  } = useImages();

  // ── Координирующая логика ─────────────────────────────────────────────────

  const deleteTrack = async (trackName) => {
    if (!confirm(`Вы уверены, что хотите полностью удалить файл "${trackName}" с диска?`))
      return;
    try {
      await deleteTrackAPI(trackName);
      setTracks((prev) => prev.filter((t) => t !== trackName));
      deleteTrackQuizData(trackName);
      if (currentTrack === trackName) {
        setCurrentTrack("");
        resetPlayer();
        setHasUnsavedChanges(false);
      }
      alert("Файл успешно удален.");
    } catch (err) {
      console.error("Ошибка удаления:", err);
      alert(`Не удалось удалить файл: ${err.message}`);
    }
  };

  const handleSelectTrack = (track) => {
    if (track === currentTrack) return;
    if (hasUnsavedChanges && !confirm("Переключить трек без сохранения?")) return;
    setCurrentTrack(track);
    setPreviewVideo(null);
  };

  useEffect(() => {
    if (mainTab === "images") fetchImageFiles();
  }, [mainTab]);

  // ── Рендер ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        backgroundColor: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ════════════ ЛЕВАЯ КОЛОНКА ════════════ */}
      <div
        style={{
          width: "300px",
          borderRight: "1px solid #334155",
          backgroundColor: "#1e293b",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Главные вкладки */}
        <div style={{ display: "flex", flexShrink: 0, borderBottom: "2px solid #0f172a" }}>
          {[["media", "🎵 Медиа"], ["images", "🖼 Изображения"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMainTab(id)}
              style={{
                flex: 1,
                padding: "11px 0",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "600",
                backgroundColor: mainTab === id ? "#0f172a" : "#1e293b",
                color: mainTab === id ? "#f1f5f9" : "#64748b",
                borderBottom: mainTab === id ? "2px solid #3b82f6" : "2px solid transparent",
              }}
            >
              {label}
            </button>
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

        {/* ── Вкладка: Медиа ── */}
        {mainTab === "media" && (
          <>
            {/* Вкладки: Поиск / По ссылке */}
            <div style={{ borderBottom: "1px solid #334155" }}>
              <div style={{ display: "flex" }}>
                {[["search", "🔍 Поиск"], ["url", "🔗 По ссылке"]].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setLeftTab(id)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: "500",
                      backgroundColor: leftTab === id ? "#0f172a" : "#1e293b",
                      color: leftTab === id ? "#f1f5f9" : "#64748b",
                      borderBottom: leftTab === id ? "2px solid #3b82f6" : "2px solid transparent",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Поиск YouTube ── */}
              {leftTab === "search" && (
                <div style={{ padding: "12px" }}>
                  <form onSubmit={handleSearch} style={{ display: "flex", gap: "6px" }}>
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Поиск на YouTube..."
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: "4px",
                        backgroundColor: "#0f172a",
                        border: "1px solid #475569",
                        color: "#e2e8f0",
                        fontSize: "12px",
                      }}
                    />
                    <button
                      type="submit"
                      disabled={isSearching || !searchQuery.trim()}
                      style={{
                        padding: "7px 12px",
                        borderRadius: "4px",
                        border: "none",
                        backgroundColor: "#3b82f6",
                        color: "#fff",
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      {isSearching ? "⏳" : "🔍"}
                    </button>
                  </form>
                </div>
              )}

              {/* ── Скачивание по URL ── */}
              {leftTab === "url" && (
                <div style={{ padding: "12px" }}>
                  <textarea
                    rows={3}
                    value={urlsText}
                    onChange={(e) => setUrlsText(e.target.value)}
                    placeholder={"Вставьте ссылки YouTube (каждая с новой строки)"}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      backgroundColor: "#0f172a",
                      border: "1px solid #475569",
                      color: "#e2e8f0",
                      fontSize: "12px",
                      fontFamily: "monospace",
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                    disabled={isDownloading}
                  />
                  <select
                    value={downloadType}
                    onChange={(e) => setDownloadType(e.target.value)}
                    disabled={isDownloading}
                    style={{
                      width: "100%",
                      marginTop: "8px",
                      padding: "6px 8px",
                      borderRadius: "4px",
                      backgroundColor: "#0f172a",
                      border: "1px solid #475569",
                      color: "#e2e8f0",
                      fontSize: "12px",
                    }}
                  >
                    <option value="audio">🎵 Аудио (MP3)</option>
                    <option value="video">🎬 Видео (MP4)</option>
                    <option value="ogg">📎 Аудио OGG — для LibreOffice</option>
                    <option value="ogv">📎 Видео OGV — для LibreOffice</option>
                  </select>
                  <button
                    onClick={handleDownload}
                    disabled={isDownloading || !urlsText.trim()}
                    style={{
                      width: "100%",
                      marginTop: "8px",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "none",
                      backgroundColor: isDownloading ? "#475569" : "#3b82f6",
                      color: "#fff",
                      fontSize: "13px",
                      fontWeight: "500",
                      cursor: isDownloading ? "not-allowed" : "pointer",
                    }}
                  >
                    {isDownloading ? "⏳ Скачивание..." : "⬇️ Скачать файлы"}
                  </button>
                  <DownloadProgressBar progress={downloadProgress} />
                </div>
              )}
            </div>

            {/* ── Результаты поиска ── */}
            {leftTab === "search" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
                {isSearching && (
                  <p style={{ color: "#64748b", fontSize: "12px", textAlign: "center", padding: "16px 0" }}>
                    🔍 Поиск...
                  </p>
                )}
                {!isSearching && searchError && (
                  <div style={{ color: "#f87171", fontSize: "12px", padding: "10px 8px", background: "#1e1b1b", borderRadius: "6px", margin: "8px 0", lineHeight: "1.5" }}>
                    ⚠️ {searchError}
                  </div>
                )}
                {!isSearching && !searchError && searchResults.length === 0 && searchQuery && (
                  <p style={{ color: "#64748b", fontSize: "12px", textAlign: "center", padding: "16px 0" }}>
                    Ничего не найдено
                  </p>
                )}
                {!isSearching && !searchError && searchResults.length === 0 && !searchQuery && (
                  <p style={{ color: "#475569", fontSize: "12px", textAlign: "center", padding: "16px 0" }}>
                    Введите запрос для поиска
                  </p>
                )}

                {searchResults.map((video) => {
                  const loadingAudio = downloadingIds[`${video.id}-audio`];
                  const loadingVideo = downloadingIds[`${video.id}-video`];
                  const loadingOgg   = downloadingIds[`${video.id}-ogg`];
                  const loadingOgv   = downloadingIds[`${video.id}-ogv`];
                  const isPreviewing = previewVideo?.id === video.id;
                  const anyLoading   = !!(loadingAudio || loadingVideo || loadingOgg || loadingOgv);
                  return (
                    <div
                      key={video.id}
                      style={{
                        display: "flex",
                        gap: "8px",
                        padding: "8px 0",
                        borderBottom: "1px solid #1e293b",
                        alignItems: "flex-start",
                        backgroundColor: isPreviewing ? "rgba(59,130,246,0.07)" : "transparent",
                        borderRadius: "4px",
                      }}
                    >
                      <img
                        src={video.thumbnail}
                        alt=""
                        onClick={() => { setPreviewVideo(video); setCurrentTrack(""); }}
                        style={{
                          width: "72px", height: "40px", objectFit: "cover",
                          borderRadius: "3px", flexShrink: 0,
                          backgroundColor: "#0f172a", cursor: "pointer",
                          outline: isPreviewing ? "2px solid #3b82f6" : "none",
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          onClick={() => { setPreviewVideo(video); setCurrentTrack(""); }}
                          style={{
                            fontSize: "11px",
                            color: isPreviewing ? "#93c5fd" : "#e2e8f0",
                            lineHeight: "1.3", marginBottom: "3px",
                            overflow: "hidden", display: "-webkit-box",
                            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                            cursor: "pointer",
                          }}
                        >
                          {video.title}
                        </div>
                        <div style={{ fontSize: "10px", color: "#64748b" }}>
                          {video.channel}{video.duration ? ` · ${formatDuration(video.duration)}` : ""}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "5px" }}>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button onClick={() => downloadFromSearch(video, "audio")} disabled={anyLoading}
                              style={{ flex: 1, padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6", backgroundColor: "rgba(59,130,246,0.15)", color: "#93c5fd", cursor: "pointer" }}>
                              {loadingAudio ? "⏳" : "🎵 MP3"}
                            </button>
                            <button onClick={() => downloadFromSearch(video, "video")} disabled={anyLoading}
                              style={{ flex: 1, padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #10b981", backgroundColor: "rgba(16,185,129,0.15)", color: "#6ee7b7", cursor: "pointer" }}>
                              {loadingVideo ? "⏳" : "🎬 MP4"}
                            </button>
                          </div>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button onClick={() => downloadFromSearch(video, "ogg")} disabled={anyLoading}
                              style={{ flex: 1, padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #f59e0b", backgroundColor: "rgba(245,158,11,0.15)", color: "#fcd34d", cursor: "pointer" }}>
                              {loadingOgg ? "⏳" : "📎 OGG"}
                            </button>
                            <button onClick={() => downloadFromSearch(video, "ogv")} disabled={anyLoading}
                              style={{ flex: 1, padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #a78bfa", backgroundColor: "rgba(167,139,250,0.15)", color: "#c4b5fd", cursor: "pointer" }}>
                              {loadingOgv ? "⏳" : "📎 OGV"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Список файлов ── */}
            <div
              style={{
                flex: leftTab === "url" ? 1 : 0,
                overflowY: "auto",
                padding: "12px",
                borderTop: leftTab === "search" && searchResults.length > 0 ? "1px solid #334155" : "none",
                maxHeight: leftTab === "search" ? "220px" : undefined,
              }}
            >
              <h3 style={{ margin: "0 0 8px 0", fontSize: "12px", fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Доступные файлы
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {tracks.map((track) => {
                  const savedCount = savedQuizData[track]?.length || 0;
                  const isSelected = currentTrack === track;
                  const fileType   = getFileType(track);
                  return (
                    <li
                      key={track}
                      onClick={() => handleSelectTrack(track)}
                      style={{
                        padding: "6px 8px", borderRadius: "4px",
                        backgroundColor: isSelected ? "#334155" : "transparent",
                        cursor: "pointer", marginBottom: "2px",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        fontSize: "12px",
                      }}
                    >
                      <span style={{ color: isSelected ? "#fff" : "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {fileType === "audio" ? "🎵" : "🎬"} {track}
                      </span>
                      <div style={{ display: "flex", gap: "6px", marginLeft: "8px" }}>
                        {savedCount > 0 && (
                          <span style={{ backgroundColor: "#10b981", padding: "2px 5px", borderRadius: "10px", fontSize: "10px", fontWeight: "500" }}>
                            {savedCount}
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteTrack(track); }}
                          style={{ background: "transparent", border: "none", cursor: "pointer", opacity: 0.5, color: "#cbd5e1", fontSize: "12px" }}
                        >
                          🗑️
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </div>

      {/* ════════════ ПРАВАЯ КОЛОНКА ════════════ */}

      {mainTab === "images" ? (
        <ImageEditor
          image={selectedImage}
          imagesDir={imagesDir}
          onClose={() => { handleSelectImage(null); imageEditorDirtyRef.current = false; }}
          onRefresh={fetchImageFiles}
          onSelectImage={handleSelectImage}
          onDirtyChange={(d) => { imageEditorDirtyRef.current = d; }}
        />
      ) : currentTrack ? (
        /* ── Плеер ── */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {/* Шапка */}
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #334155", backgroundColor: "#1e293b" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "500", color: "#f1f5f9" }}>
                {currentFileType === "audio" ? "🎵" : "🎬"} {currentTrack}
              </h2>
              <button
                onClick={handleExportAll}
                disabled={!hasAnySavedSegments || isExporting}
                style={{
                  padding: "6px 12px", borderRadius: "4px", border: "none",
                  backgroundColor: !hasAnySavedSegments ? "#475569" : "#10b981",
                  color: "#fff", fontSize: "12px", fontWeight: "500",
                  cursor: !hasAnySavedSegments || isExporting ? "not-allowed" : "pointer",
                }}
              >
                {isExporting ? "⏳ Экспорт..." : "🚀 Экспорт"}
              </button>
            </div>

            {/* Видеоплеер — нативные контролы, без sync-логики */}
            {currentFileType === "video" && !isConverting && (
              <div style={{ marginBottom: "16px" }}>
                <video
                  ref={videoRef}
                  src={`http://127.0.0.1:8000/audio/${encodeURIComponent(currentTrack)}`}
                  controls
                  style={{ width: "100%", maxHeight: "360px", backgroundColor: "#000", borderRadius: "8px" }}
                />
              </div>
            )}

            {/* WaveSurfer */}
            {isConverting ? (
              <div style={{ textAlign: "center", padding: "30px", backgroundColor: "#1e293b", borderRadius: "8px" }}>
                <p style={{ fontSize: "13px", color: "#94a3b8" }}>
                  🔄 Конвертация видео в аудио для визуализации...
                </p>
              </div>
            ) : (
              <div
                key={currentTrack}
                ref={containerRef}
                style={{
                  backgroundColor: "#0f172a",
                  borderRadius: "8px",
                  padding: "8px",
                  border: "1px solid #334155",
                  marginBottom: "16px",
                }}
              />
            )}

            {/* Контролы */}
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={togglePlay}
                style={{
                  padding: "6px 14px", borderRadius: "4px", border: "none",
                  backgroundColor: isPlaying ? "#ef4444" : "#3b82f6",
                  color: "#fff", fontSize: "13px", fontWeight: "500", cursor: "pointer",
                }}
              >
                {isPlaying ? "⏸ Пауза" : "▶ Пуск"}
              </button>

              <div style={{ fontFamily: "monospace", fontSize: "13px", backgroundColor: "#f1f5f9", color: "#1e293b", padding: "4px 10px", borderRadius: "4px" }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>

              <button onClick={addQuestionRegion}
                style={{ padding: "6px 12px", borderRadius: "4px", border: "1px solid #3b82f6", backgroundColor: "rgba(59,130,246,0.15)", color: "#93c5fd", fontSize: "12px", fontWeight: "500", cursor: "pointer" }}>
                🔵 Вопрос
              </button>

              <button onClick={addAnswerRegion}
                style={{ padding: "6px 12px", borderRadius: "4px", border: "1px solid #10b981", backgroundColor: "rgba(16,185,129,0.15)", color: "#6ee7b7", fontSize: "12px", fontWeight: "500", cursor: "pointer" }}>
                🟢 Ответ
              </button>

              <button onClick={saveCurrentTrackSegments}
                style={{ padding: "6px 12px", borderRadius: "4px", border: "none", backgroundColor: "#e2e8f0", color: "#1e293b", fontSize: "12px", fontWeight: "500", cursor: "pointer" }}>
                💾 Сохранить
              </button>
            </div>

            {hasUnsavedChanges && (
              <p style={{ color: "#f59e0b", fontSize: "11px", marginTop: "8px" }}>
                ⚠️ Есть несохраненные маркеры
              </p>
            )}
          </div>

          {/* Регионы */}
          <div style={{ padding: "20px 24px" }}>
            <div style={{ backgroundColor: "#1e293b", padding: "16px", borderRadius: "8px", marginBottom: "20px" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                ⏳ Текущие регионы
              </h3>
              {activeRegions.length > 0 ? (
                activeRegions.map((reg) => {
                  const isQuestion = reg.color.includes("59, 130, 246");
                  return (
                    <div key={reg.id}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", backgroundColor: "#0f172a", borderRadius: "6px", marginBottom: "8px", borderLeft: isQuestion ? "3px solid #3b82f6" : "3px solid #10b981" }}>
                      <div style={{ fontSize: "12px" }}>
                        <strong style={{ color: isQuestion ? "#60a5fa" : "#34d399" }}>
                          [{isQuestion ? "Вопрос" : "Ответ"}]
                        </strong>
                        <span style={{ marginLeft: "8px", color: "#cbd5e1" }}>
                          {reg.start.toFixed(1)}с — {reg.end.toFixed(1)}с ({(reg.end - reg.start).toFixed(1)}с)
                        </span>
                      </div>
                      <div>
                        <button onClick={() => playRegion(reg.start, reg.end)}
                          style={{ padding: "3px 8px", backgroundColor: "rgba(59,130,246,0.2)", border: "1px solid #3b82f6", color: "#93c5fd", borderRadius: "4px", cursor: "pointer", marginRight: "6px", fontSize: "11px" }}>
                          ▶
                        </button>
                        <button onClick={() => removeTimelineRegion(reg.id)}
                          style={{ padding: "3px 6px", backgroundColor: "rgba(239,68,68,0.2)", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: "4px", cursor: "pointer", fontSize: "11px" }}>
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p style={{ color: "#64748b", fontSize: "12px", margin: 0 }}>
                  Нет выделенных областей. Добавьте "Вопрос" или "Ответ".
                </p>
              )}
            </div>

            {/* Зафиксированные отрезки */}
            <div style={{ backgroundColor: "#1e293b", padding: "16px", borderRadius: "8px" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                📦 Зафиксированные отрезки
              </h3>
              {hasAnySavedSegments ? (
                Object.keys(savedQuizData).map((trackName) => (
                  <div key={trackName} style={{ backgroundColor: "#0f172a", padding: "10px", borderRadius: "6px", marginBottom: "10px" }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "#38bdf8", marginBottom: "6px" }}>
                      📁 {trackName}
                    </div>
                    {savedQuizData[trackName].map((seg, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #334155", fontSize: "11px" }}>
                        <span>
                          <strong style={{ color: seg.type === "question" ? "#60a5fa" : "#34d399" }}>
                            [{seg.type === "question" ? "Вопрос" : "Ответ"}]
                          </strong>{" "}
                          {seg.label} ({seg.start.toFixed(1)}с - {seg.end.toFixed(1)}с)
                        </span>
                        <button onClick={() => deleteSavedSegment(trackName, seg.id)}
                          style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "11px" }}>
                          ❌
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <p style={{ color: "#64748b", fontSize: "12px", margin: 0 }}>
                  Нет зафиксированных данных. Сохраните отрезки для трека.
                </p>
              )}
            </div>
          </div>
        </div>

      ) : previewVideo ? (
        /* ── Превью YouTube ── */
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
              {[
                ["audio", "🎵 MP3",  "#3b82f6", "rgba(59,130,246,0.15)",  "#93c5fd"],
                ["video", "🎬 MP4",  "#10b981", "rgba(16,185,129,0.15)",  "#6ee7b7"],
                ["ogg",   "📎 OGG",  "#f59e0b", "rgba(245,158,11,0.15)",  "#fcd34d"],
                ["ogv",   "📎 OGV",  "#a78bfa", "rgba(167,139,250,0.15)", "#c4b5fd"],
              ].map(([type, label, border, bg, color]) => (
                <button key={type} onClick={() => downloadFromSearch(previewVideo, type)}
                  disabled={!!downloadingIds[`${previewVideo.id}-${type}`]}
                  style={{ padding: "6px 14px", borderRadius: "4px", border: `1px solid ${border}`, backgroundColor: bg, color, fontSize: "12px", fontWeight: "500", cursor: "pointer" }}>
                  {downloadingIds[`${previewVideo.id}-${type}`] ? "⏳" : label}
                </button>
              ))}
              <button onClick={() => setPreviewVideo(null)}
                style={{ padding: "6px 10px", borderRadius: "4px", border: "none", backgroundColor: "transparent", color: "#64748b", fontSize: "16px", cursor: "pointer" }}>
                ✕
              </button>
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
