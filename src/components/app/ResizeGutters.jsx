import { getCurrentWindow } from "@tauri-apps/api/window";

// Custom-decorations resize affordances. With `decorations: false` on the
// Windows DWM, native edge-resize disappears even when `resizable: true` is
// set — these 8 invisible hit zones restore drag-to-resize via Tauri's
// startResizeDragging.
export default function ResizeGutters() {
  const drag = (dir) => (e) => {
    e.preventDefault();
    getCurrentWindow()
      .startResizeDragging(dir)
      .catch(() => {});
  };
  return (
    <>
      <div
        onMouseDown={drag("North")}
        className="fixed top-0 left-3 right-3 h-1.5 cursor-ns-resize z-40"
      />
      <div
        onMouseDown={drag("South")}
        className="fixed bottom-0 left-3 right-3 h-1.5 cursor-ns-resize z-40"
      />
      <div
        onMouseDown={drag("West")}
        className="fixed top-3 bottom-3 left-0 w-1.5 cursor-ew-resize z-40"
      />
      <div
        onMouseDown={drag("East")}
        className="fixed top-3 bottom-3 right-0 w-1.5 cursor-ew-resize z-40"
      />
      <div
        onMouseDown={drag("NorthWest")}
        className="fixed top-0 left-0 w-3 h-3 cursor-nwse-resize z-40"
      />
      <div
        onMouseDown={drag("NorthEast")}
        className="fixed top-0 right-0 w-3 h-3 cursor-nesw-resize z-40"
      />
      <div
        onMouseDown={drag("SouthWest")}
        className="fixed bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-40"
      />
      <div
        onMouseDown={drag("SouthEast")}
        className="fixed bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-40"
      />
    </>
  );
}
