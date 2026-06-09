const DIRECTION_BADGES = {
  sent: "bg-accent-blue/20 text-accent-blue border-accent-blue/30",
  recv: "bg-status-green/20 text-status-green border-status-green/30",
  system: "bg-val-red/20 text-val-red border-val-red/30",
  error: "bg-status-red/20 text-status-red border-status-red/30",
  own_presence: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  debug: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  f_debug: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

export function XmppLogPanel({
  logs,
  logFilter,
  onFilterChange,
  logContainerRef,
  logEndRef,
  onScroll,
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="flex-1 min-h-0 rounded-xl bg-base-800 border border-border overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0">
          <p className="text-xs font-display font-medium text-text-secondary">XMPP Log</p>
          <div className="flex items-center gap-2">
            {["all", "own_presence", "f_debug", "debug", "sent", "system"].map((f) => (
              <button
                key={f}
                onClick={() => onFilterChange(f)}
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                  logFilter === f
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                    : "text-text-muted border-transparent hover:text-text-secondary"
                }`}
              >
                {f}
              </button>
            ))}
            <span className="text-[10px] font-body text-text-muted">{logs.length}</span>
          </div>
        </div>
        <div
          ref={logContainerRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px]"
        >
          {logs.length === 0 && (
            <p className="text-text-muted text-center py-8 font-body text-xs">No logs yet</p>
          )}
          {logs
            .filter((l) => logFilter === "all" || l.direction === logFilter)
            .map((log, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 px-2 py-1 rounded hover:bg-base-700/50 ${log.direction === "own_presence" ? "bg-yellow-500/5 border-l-2 border-yellow-500/40" : ""}`}
              >
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border shrink-0 ${
                    DIRECTION_BADGES[log.direction] ||
                    "bg-val-red/20 text-val-red border-val-red/30"
                  }`}
                >
                  {log.direction}
                </span>
                <span className="text-text-muted/50 shrink-0 text-[9px] tabular-nums leading-5">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <pre className="text-text-secondary whitespace-pre-wrap break-all leading-5 flex-1 select-all">
                  {log.data}
                </pre>
              </div>
            ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
