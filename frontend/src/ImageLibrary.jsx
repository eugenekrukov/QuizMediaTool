import { useRef, useState } from "react";

const API = "http://127.0.0.1:8000";

export default function ImageLibrary({
  imagesDir,
  imageFiles,
  selectedImage,
  onSelectImage,
  onDeleteImage,
  onDirChange,
  onRefresh,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [localDirInput, setLocalDirInput] = useState("");
  const [isPicking, setIsPicking] = useState(false);
  const fileInputRef = useRef(null);

  const startEdit = () => {
    setLocalDirInput(imagesDir || "");
    setIsEditing(true);
  };

  const commitEdit = () => {
    if (localDirInput.trim()) onDirChange(localDirInput.trim());
    setIsEditing(false);
  };

  const handlePickFolder = async () => {
    setIsPicking(true);
    try {
      const res = await fetch(`${API}/images/pick-folder`);
      const data = await res.json();
      if (data.path) {
        onDirChange(data.path);
      }
    } catch (e) {
      console.error("Ошибка выбора папки:", e);
    } finally {
      setIsPicking(false);
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      await fetch(`${API}/images/upload`, { method: "POST", body: formData });
    }
    onRefresh();
    e.target.value = "";
  };

  const plural = (n) => {
    if (n % 10 === 1 && n % 100 !== 11) return "файл";
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return "файла";
    return "файлов";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>

      {/* Настройка папки */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #334155", flexShrink: 0 }}>
        <div style={{ fontSize: "10px", color: "#64748b", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Папка с изображениями
        </div>
        <div style={{ display: "flex", gap: "5px" }}>
          <input
            value={isEditing ? localDirInput : (imagesDir || "")}
            readOnly={!isEditing}
            onChange={(e) => setLocalDirInput(e.target.value)}
            onFocus={startEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setIsEditing(false);
            }}
            placeholder="C:/путь/к/папке"
            style={{
              flex: 1, padding: "5px 7px", borderRadius: "4px",
              backgroundColor: "#0f172a", border: `1px solid ${isEditing ? "#3b82f6" : "#334155"}`,
              color: "#e2e8f0", fontSize: "10px", fontFamily: "monospace", minWidth: 0,
              cursor: isEditing ? "text" : "pointer",
            }}
          />
          <button
            onClick={handlePickFolder}
            disabled={isPicking}
            title="Выбрать папку"
            style={{
              padding: "5px 8px", borderRadius: "4px", border: "1px solid #334155",
              backgroundColor: isPicking ? "#1e293b" : "transparent",
              color: isPicking ? "#475569" : "#94a3b8",
              fontSize: "13px", cursor: isPicking ? "wait" : "pointer", flexShrink: 0,
            }}
          >📁</button>
          {isEditing ? (
            <button
              onClick={commitEdit}
              style={{ padding: "5px 9px", borderRadius: "4px", border: "none", backgroundColor: "#3b82f6", color: "#fff", fontSize: "11px", cursor: "pointer", flexShrink: 0 }}
            >✓</button>
          ) : (
            <button
              onClick={onRefresh}
              title="Обновить список"
              style={{ padding: "5px 8px", borderRadius: "4px", border: "1px solid #334155", backgroundColor: "transparent", color: "#64748b", fontSize: "13px", cursor: "pointer", flexShrink: 0 }}
            >↺</button>
          )}
        </div>
      </div>

      {/* Шапка списка */}
      <div style={{ padding: "7px 12px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <span style={{ fontSize: "11px", color: "#64748b" }}>
          {imageFiles.length} {plural(imageFiles.length)}
        </span>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ padding: "3px 10px", borderRadius: "4px", border: "1px solid #3b82f6", backgroundColor: "rgba(59,130,246,0.12)", color: "#93c5fd", fontSize: "11px", cursor: "pointer" }}
        >+ Добавить</button>
        <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={handleFileSelect} />
      </div>

      {/* Список превью */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
        {imageFiles.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px 12px", color: "#475569" }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>📂</div>
            <div style={{ fontSize: "11px", lineHeight: "1.6" }}>
              Папка пуста.<br />
              Перетащите изображение<br />
              в поле справа.
            </div>
          </div>
        ) : (
          imageFiles.map((file) => {
            const isSelected = selectedImage?.filename === file.filename;
            const imgUrl = `${API}/images/file/${encodeURIComponent(file.filename)}`;
            return (
              <div
                key={file.filename}
                onClick={() => onSelectImage({ filename: file.filename, url: imgUrl })}
                style={{
                  display: "flex", gap: "8px", alignItems: "center",
                  padding: "5px 6px", borderRadius: "6px", marginBottom: "3px",
                  backgroundColor: isSelected ? "rgba(59,130,246,0.15)" : "transparent",
                  border: `1px solid ${isSelected ? "#3b82f6" : "transparent"}`,
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <img
                  src={imgUrl}
                  alt=""
                  style={{ width: "58px", height: "40px", objectFit: "cover", borderRadius: "3px", backgroundColor: "#0f172a", flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "11px", color: isSelected ? "#93c5fd" : "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file.filename}
                  </div>
                  <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>
                    {file.size < 1024 * 1024
                      ? `${(file.size / 1024).toFixed(0)} KB`
                      : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteImage(file.filename); }}
                  title="Удалить из папки"
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b", fontSize: "12px", padding: "2px 4px", flexShrink: 0, opacity: 0.6, lineHeight: 1 }}
                >🗑️</button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
