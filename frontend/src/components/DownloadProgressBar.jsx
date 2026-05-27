/**
 * Полоса прогресса скачивания файлов по URL.
 * @param {{ progress: { current: number, total: number, status: string } }} props
 */
export default function DownloadProgressBar({ progress }) {
  if (progress.total === 0) return null;
  const percentage = (progress.current / progress.total) * 100;

  return (
    <div
      style={{
        marginTop: "8px",
        padding: "8px",
        backgroundColor: "#1e293b",
        borderRadius: "4px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "4px",
          fontSize: "11px",
          color: "#94a3b8",
        }}
      >
        <span>
          {progress.status === "downloading" ? "📥 Скачивание..." : "✅ Завершено!"}
        </span>
        <span>
          {progress.current} / {progress.total}
        </span>
      </div>
      <div
        style={{
          backgroundColor: "#0f172a",
          borderRadius: "2px",
          overflow: "hidden",
          height: "4px",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            backgroundColor: "#3b82f6",
            transition: "width 0.3s ease-in-out",
          }}
        />
      </div>
    </div>
  );
}
