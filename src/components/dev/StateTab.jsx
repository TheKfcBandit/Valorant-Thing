import { useEffect, useState } from "react";

export function StateTab() {
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [editKey, setEditKey] = useState(null);
  const [editValue, setEditValue] = useState("");

  const refresh = () => {
    const items = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      items.push({ key, value: localStorage.getItem(key) });
    }
    items.sort((a, b) => a.key.localeCompare(b.key));
    setEntries(items);
  };

  useEffect(refresh, []);

  const filtered = search
    ? entries.filter(
        (e) =>
          e.key.toLowerCase().includes(search.toLowerCase()) ||
          e.value.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  const copyAll = () => {
    const obj = {};
    entries.forEach((e) => {
      obj[e.key] = e.value;
    });
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const startEdit = (key, value) => {
    setEditKey(key);
    setEditValue(value);
  };

  const saveEdit = () => {
    if (editKey) {
      localStorage.setItem(editKey, editValue);
      refresh();
      setEditKey(null);
    }
  };

  const deleteKey = (key) => {
    localStorage.removeItem(key);
    refresh();
  };

  const truncate = (str, len = 80) => (str.length > len ? str.slice(0, len) + "..." : str);

  return (
    <>
      <div className="flex items-center gap-2 shrink-0">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter keys..."
          className="flex-1 px-2.5 py-1.5 bg-base-700 border border-border rounded text-xs font-body text-text-primary outline-none focus:border-val-red/60 transition-colors"
        />
        <span className="text-[10px] font-body text-text-muted">
          {filtered.length}/{entries.length}
        </span>
        {copied && <span className="text-[10px] font-body text-status-green">Copied!</span>}
        <button
          onClick={copyAll}
          className="px-2 py-1 text-[10px] font-display font-medium rounded bg-base-600 text-text-muted hover:text-text-secondary transition-colors"
        >
          Export All
        </button>
        <button
          onClick={refresh}
          className="px-2 py-1 text-[10px] font-display font-medium rounded bg-base-600 text-text-muted hover:text-text-secondary transition-colors"
        >
          Refresh
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg bg-base-800 border border-border">
        <div className="divide-y divide-border">
          {filtered.map((e) => (
            <div key={e.key} className="px-3 py-2 hover:bg-base-700/50 transition-colors group">
              {editKey === e.key ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono text-val-red font-semibold">{e.key}</p>
                  <textarea
                    value={editValue}
                    onChange={(ev) => setEditValue(ev.target.value)}
                    rows={3}
                    className="w-full px-2 py-1.5 bg-base-700 border border-border rounded text-[10px] font-mono text-text-primary outline-none resize-none"
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={saveEdit}
                      className="px-2 py-0.5 text-[10px] font-display rounded bg-status-green/20 text-status-green border border-status-green/40 hover:bg-status-green/30 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditKey(null)}
                      className="px-2 py-0.5 text-[10px] font-display rounded bg-base-600 text-text-muted border border-border hover:text-text-secondary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-mono text-val-red font-semibold">{e.key}</p>
                    <p className="text-[10px] font-mono text-text-muted mt-0.5 break-all">
                      {truncate(e.value)}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(e.value);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      className="px-1.5 py-0.5 text-[9px] font-display rounded bg-base-600 text-text-muted hover:text-text-secondary transition-colors"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => startEdit(e.key, e.value)}
                      className="px-1.5 py-0.5 text-[9px] font-display rounded bg-base-600 text-text-muted hover:text-text-secondary transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteKey(e.key)}
                      className="px-1.5 py-0.5 text-[9px] font-display rounded bg-status-red/20 text-status-red hover:bg-status-red/30 transition-colors"
                    >
                      Del
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
