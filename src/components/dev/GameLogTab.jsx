import { useRef, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAsyncEffect } from "../../hooks/useAsyncEffect";

const MAX_LINES = 1000;
const POLL_MS = 2000;
const LOG_LEVEL_COLORS = {
  Log: "text-text-primary/70",
  Warning: "text-yellow-400",
  Error: "text-status-red",
  Display: "text-accent-blue/80",
};

function parseLogLevel(line) {
  if (line.includes(": Error:") || line.includes("LogError")) return "Error";
  if (line.includes(": Warning:") || line.includes("LogWarning")) return "Warning";
  if (line.includes(": Display:")) return "Display";
  return "Log";
}

export function GameLogTab() {
  const [lines, setLines] = useState([]);
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(null);
  const [fileSize, setFileSize] = useState(0);
  const [levelFilter, setLevelFilter] = useState("all");
  const offsetRef = useRef(0);
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const autoScrollRef = useRef(true);
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const handleScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      autoScrollRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    };
    const el = containerRef.current;
    el?.addEventListener("scroll", handleScroll);
    return () => el?.removeEventListener("scroll", handleScroll);
  }, []);

  useAsyncEffect(async (isCancelled) => {
    let initialized = false;
    const poll = async () => {
      if (isCancelled()) return;
      if (!pausedRef.current) {
        try {
          const res = await invoke("read_game_log", { offset: offsetRef.current });
          if (isCancelled()) return;
          setError(null);
          setFileSize(res.fileSize);
          if (!initialized) {
            initialized = true;
            offsetRef.current = res.offset;
          } else {
            if (res.text) {
              const newLines = res.text.split("\n").filter((l) => l.length > 0);
              if (newLines.length > 0) {
                setLines((prev) => {
                  const combined = [...prev, ...newLines];
                  return combined.length > MAX_LINES ? combined.slice(-MAX_LINES) : combined;
                });
              }
            }
            offsetRef.current = res.offset;
          }
        } catch (e) {
          if (!isCancelled()) setError(String(e));
        }
      }
      if (!isCancelled()) setTimeout(poll, POLL_MS);
    };
    await poll();
  }, []);

  useEffect(() => {
    if (autoScrollRef.current && !paused) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [lines.length, paused]);

  const filtered = lines.filter((l) => {
    if (levelFilter !== "all" && parseLogLevel(l) !== levelFilter) return false;
    if (search && !l.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <>
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
        {["all", "Log", "Warning", "Error", "Display"].map((f) => (
          <button
            key={f}
            onClick={() => setLevelFilter(f)}
            className={`px-2 py-0.5 text-[10px] font-display font-medium rounded transition-colors ${
              levelFilter === f
                ? "bg-base-500 text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {f === "all" ? "ALL" : f.toUpperCase()}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[10px] font-body text-text-muted">{formatSize(fileSize)}</span>
        <span className="text-[10px] font-body text-text-muted">{filtered.length} lines</span>
        <button
          onClick={() => setPaused((p) => !p)}
          className={`px-2 py-0.5 text-[10px] font-display font-medium rounded transition-colors ${
            paused
              ? "bg-status-green/20 text-status-green border border-status-green/40"
              : "bg-base-600 text-text-muted hover:text-text-secondary"
          }`}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          onClick={async () => {
            setLines([]);
            try {
              const res = await invoke("read_game_log", { offset: 0 });
              offsetRef.current = res.offset;
            } catch (e) {
              console.warn("[Dev] suppressed:", e);
            }
          }}
          className="px-2 py-0.5 text-[10px] font-display font-medium rounded bg-status-red/20 text-status-red hover:bg-status-red/30 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="shrink-0">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter logs..."
          className="w-full px-2.5 py-1.5 bg-base-700 border border-border rounded text-xs font-body text-text-primary outline-none focus:border-val-red/60 transition-colors"
        />
      </div>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-lg bg-base-800 border border-border font-mono"
      >
        {error ? (
          <div className="flex items-center justify-center h-full text-status-red text-xs font-body p-4 text-center">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-xs font-body">
            {lines.length === 0 ? "Waiting for ShooterGame.log..." : "No matching lines."}
          </div>
        ) : (
          <div className="p-2">
            {filtered.map((line, i) => {
              const level = parseLogLevel(line);
              return (
                <div
                  key={i}
                  className="text-[10px] leading-[1.6] px-1.5 py-px hover:bg-base-700/40 transition-colors rounded cursor-default select-text"
                >
                  <span className={LOG_LEVEL_COLORS[level] || "text-text-primary/70"}>{line}</span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </>
  );
}
