import { useState, useRef } from "react";
import { fetchImagesAPI, deleteImageAPI, saveImagesDirAPI } from "../api";

/**
 * Управляет галереей изображений: список файлов, выбранное изображение,
 * смена папки, удаление.
 */
export function useImages() {
  const [imagesDir, setImagesDir] = useState("");
  const [imageFiles, setImageFiles] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const imageEditorDirtyRef = useRef(false);

  const fetchImageFiles = async () => {
    try {
      const data = await fetchImagesAPI();
      setImageFiles(data.files || []);
      setImagesDir(data.images_dir || "");
    } catch (err) {
      console.error("Ошибка загрузки изображений:", err);
    }
  };

  const handleSelectImage = (img) => {
    if (
      imageEditorDirtyRef.current &&
      img?.filename !== selectedImage?.filename
    ) {
      if (
        !window.confirm(
          "Есть несохранённые изменения. Перейти к другому изображению?"
        )
      )
        return;
    }
    setSelectedImage(img);
  };

  const handleDeleteImage = async (filename) => {
    if (!confirm(`Удалить "${filename}" из папки?`)) return;
    try {
      await deleteImageAPI(filename);
      setImageFiles((prev) => prev.filter((f) => f.filename !== filename));
      if (selectedImage?.filename === filename) setSelectedImage(null);
    } catch (err) {
      alert(`Не удалось удалить: ${err.message}`);
    }
  };

  const handleImagesDirChange = async (newDir) => {
    try {
      const data = await saveImagesDirAPI(newDir);
      setImagesDir(data.images_dir);
      await fetchImageFiles();
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  };

  return {
    imagesDir,
    imageFiles,
    selectedImage,
    setSelectedImage,
    imageEditorDirtyRef,
    fetchImageFiles,
    handleSelectImage,
    handleDeleteImage,
    handleImagesDirChange,
  };
}
