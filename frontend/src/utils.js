export const getFileType = (filename) => {
  const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov'];
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return videoExtensions.includes(ext) ? "video" : "audio";
};

export const formatDuration = (sec) => {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export const formatTime = (timeInSeconds) => {
  if (isNaN(timeInSeconds) || timeInSeconds === undefined) return "00:00";
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};
