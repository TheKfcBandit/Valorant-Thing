import { useRef, useEffect, useState } from "react";

export function LogsTab({ logs, onClear }) {
  const bottomRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  const filtered = filter === "all" ? logs : logs.filter((l) => l.type === filter);

  const handleCopy = (log) => {
    const text = log.data
      ? `[${log.time}] ${log.message}\n${typeof log.data === "string" ? log.data : JSON.stringify(log.data, null, 2)}`
      : `[${log.time}] ${log.message}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyAll = () => {
    const text = filtered
      .map((l) => {
        const base = `[${l.time}] [${(l.type || "info").toUpperCase()}] ${l.message}`;
        return l.data
          ? `${base}\n${typeof l.data === "string" ? l.data : JSON.stringify(l.data, null, 2)}`
          : base;
      })
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div className="flex items-center gap-1.5 shrink-0">
        {["all", "info", "error", "match"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 text-[10px] font-display font-medium rounded transition-colors ${
              filter === f
                ? "bg-base-500 text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {f.toUpperCase()}
          </button>
        ))}
        <div className="flex-1" />
        {copied && <span className="text-[10px] font-body text-status-green">Copied!</span>}
        <span className="text-[10px] font-body text-text-muted">{filtered.length}</span>
        <button
          onClick={copyAll}
          className="px-2 py-0.5 text-[10px] font-display font-medium rounded bg-base-600 text-text-muted hover:text-text-secondary transition-colors"
        >
          Copy All
        </button>
        <button
          onClick={onClear}
          className="px-2 py-0.5 text-[10px] font-display font-medium rounded bg-status-red/20 text-status-red hover:bg-status-red/30 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-lg bg-base-800 border border-border font-mono">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-xs font-body">
            No logs yet.
          </div>
        ) : (
          <div className="p-2 space-y-px">
            {filtered.map((log, i) => (
              <div
                key={i}
                onClick={() => handleCopy(log)}
                className="text-[11px] leading-relaxed cursor-pointer rounded px-1.5 py-0.5 -mx-0.5 hover:bg-base-700/60 transition-colors break-all"
              >
                <span className="text-text-muted/60">{log.time}</span>{" "}
                <span
                  className={
                    log.type === "error"
                      ? "text-status-red font-semibold"
                      : log.type === "match"
                        ? "text-status-green font-semibold"
                        : "text-accent-blue/70"
                  }
                >
                  {(log.type || "info").toUpperCase()}
                </span>{" "}
                <span className="text-text-primary/90">{log.message}</span>
                {log.data && (
                  <pre className="mt-0.5 text-[10px] text-text-muted/50 whitespace-pre-wrap break-all max-h-32 overflow-y-auto pl-2 border-l border-border/30">
                    {typeof log.data === "string" ? log.data : JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </>
  );
}
