import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function CloudTab({ addLog }) {
  const [saveType, setSaveType] = useState("agent");
  const [saveData, setSaveData] = useState("{}");
  const [saveResult, setSaveResult] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [loadCode, setLoadCode] = useState("");
  const [loadResult, setLoadResult] = useState(null);
  const [loadLoading, setLoadLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setError(null);
    setSaveResult(null);
    setSaveLoading(true);
    try {
      const data = JSON.parse(saveData);
      const code = await invoke("cloud_save", { saveType, data });
      setSaveResult(code);
      addLog?.("info", `[Dev] Cloud save: ${code}`);
    } catch (e) {
      setError(`Save failed: ${e.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleLoad = async () => {
    setError(null);
    setLoadResult(null);
    setLoadLoading(true);
    try {
      const result = await invoke("cloud_load", { code: loadCode });
      setLoadResult(result);
      addLog?.("info", `[Dev] Cloud load: ${loadCode} → type=${result.type}`);
    } catch (e) {
      setError(`Load failed: ${e.message}`);
    } finally {
      setLoadLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
      <div className="rounded-lg bg-base-800 border border-border p-3 space-y-3">
        <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
          Save to Cloud
        </p>
        <div className="flex items-center gap-2">
          <select
            value={saveType}
            onChange={(e) => setSaveType(e.target.value)}
            className="px-2.5 py-1.5 bg-base-700 border border-border rounded text-xs font-body text-text-primary outline-none"
          >
            <option value="agent">Agent Profile</option>
            <option value="theme">Theme</option>
            <option value="config">Config</option>
          </select>
          <button
            onClick={handleSave}
            disabled={saveLoading}
            className="px-3 py-1.5 rounded bg-val-red/20 border border-val-red/40 text-val-red text-xs font-display font-medium hover:bg-val-red/30 transition-colors disabled:opacity-50"
          >
            {saveLoading ? "Saving..." : "Save"}
          </button>
        </div>
        <textarea
          value={saveData}
          onChange={(e) => setSaveData(e.target.value)}
          rows={4}
          className="w-full px-2.5 py-2 bg-base-700 border border-border rounded text-[11px] font-mono text-text-primary outline-none focus:border-val-red/60 transition-colors resize-none"
          placeholder='{"key": "value"}'
        />
        {saveResult && (
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-status-green bg-status-green/10 px-2 py-1 rounded">
              {saveResult}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(saveResult);
              }}
              className="text-[10px] font-body text-text-muted hover:text-text-secondary transition-colors"
            >
              Copy
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-base-800 border border-border p-3 space-y-3">
        <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
          Load from Cloud
        </p>
        <div className="flex items-center gap-2">
          <input
            value={loadCode}
            onChange={(e) => setLoadCode(e.target.value)}
            placeholder="VT-AGENT-XXXXX"
            className="flex-1 px-2.5 py-1.5 bg-base-700 border border-border rounded text-xs font-mono text-text-primary outline-none focus:border-val-red/60 transition-colors"
          />
          <button
            onClick={handleLoad}
            disabled={loadLoading || !loadCode.trim()}
            className="px-3 py-1.5 rounded bg-accent-blue/20 border border-accent-blue/40 text-accent-blue text-xs font-display font-medium hover:bg-accent-blue/30 transition-colors disabled:opacity-50"
          >
            {loadLoading ? "Loading..." : "Load"}
          </button>
        </div>
        {loadResult && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-display font-bold text-text-muted uppercase">
                Type:
              </span>
              <span className="text-xs font-mono text-text-primary">{loadResult.type}</span>
            </div>
            <pre className="text-[10px] font-mono text-text-secondary bg-base-700 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">
              {JSON.stringify(loadResult.data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {error && <p className="text-xs font-body text-status-red">{error}</p>}
    </div>
  );
}
