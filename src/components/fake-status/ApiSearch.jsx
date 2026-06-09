import { useState, useEffect, useRef } from "react";
import { inputClass } from "./FormControls";

const apiCache = {};
async function fetchApi(endpoint) {
  if (apiCache[endpoint]) return apiCache[endpoint];
  const res = await fetch(`https://valorant-api.com/v1/${endpoint}?language=en-US`);
  const json = await res.json();
  apiCache[endpoint] = json.data || [];
  return apiCache[endpoint];
}

export function ApiSearch({ value, onChange, endpoint, nameKey, iconKey, placeholder }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const dropRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    const handler = (e) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target) &&
        dropRef.current &&
        !dropRef.current.contains(e.target)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onScroll = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  useEffect(() => {
    if (!open || !inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const maxH = 208;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    if (spaceBelow >= 80) {
      setPos({ top: r.bottom + 4, left: r.left, width: r.width, maxH: Math.min(maxH, spaceBelow) });
    } else {
      const spaceAbove = r.top - 8;
      const h = Math.min(maxH, spaceAbove);
      setPos({ top: r.top - h - 4, left: r.left, width: r.width, maxH: h });
    }
  }, [open]);

  const loadItems = async () => {
    if (items.length > 0) return;
    setLoading(true);
    try {
      setItems(await fetchApi(endpoint));
    } catch (e) {
      console.warn("[FakeStatus] suppressed:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (value && items.length > 0) {
      const match = items.find((i) => i.uuid === value);
      if (match) {
        setSelectedName(match[nameKey] || "");
        if (iconKey) setSelectedIcon(match[iconKey]);
      }
    }
  }, [value, items]);

  useEffect(() => {
    loadItems();
  }, []);

  const filtered = query
    ? items
        .filter((i) => (i[nameKey] || "").toLowerCase().includes(query.toLowerCase()))
        .slice(0, 50)
    : items.slice(0, 50);

  return (
    <div ref={containerRef}>
      <div className="flex items-center gap-1.5">
        {selectedIcon && (
          <img src={selectedIcon} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
        )}
        <input
          ref={inputRef}
          value={open ? query : selectedName || ""}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            loadItems();
          }}
          placeholder={placeholder}
          className={inputClass}
        />
        {value && (
          <button
            onClick={() => {
              onChange("");
              setSelectedName("");
              setSelectedIcon(null);
              setQuery("");
            }}
            className="text-text-muted hover:text-text-secondary text-xs shrink-0 px-1"
          >
            ✕
          </button>
        )}
      </div>
      {open && (
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-base-800 border border-border rounded-lg shadow-xl overflow-y-auto"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
        >
          {loading && <p className="text-[10px] text-text-muted text-center py-3">Loading...</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-[10px] text-text-muted text-center py-3">No results</p>
          )}
          {filtered.map((item) => (
            <button
              key={item.uuid}
              onClick={() => {
                onChange(item.uuid);
                setSelectedName(item[nameKey] || "");
                if (iconKey) setSelectedIcon(item[iconKey]);
                setOpen(false);
                setQuery("");
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-body hover:bg-base-600 transition-colors ${item.uuid === value ? "bg-base-600 text-text-primary" : "text-text-secondary"}`}
            >
              {iconKey && item[iconKey] && (
                <img src={item[iconKey]} alt="" className="w-5 h-5 rounded object-cover shrink-0" />
              )}
              <span className="truncate">{item[nameKey] || "(unnamed)"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
