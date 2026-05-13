import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic", defaultModel: "claude-haiku-4-5", baseUrlEditable: false },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini", baseUrlEditable: false },
  { id: "openai-compat", label: "OpenAI-compatible", defaultModel: "gpt-4o-mini", baseUrlEditable: true },
];

export default function CoachPage({ connected }) {
  const [provider, setProvider] = useState(() => localStorage.getItem("coach_provider") || "anthropic");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("coach_api_key") || "");
  const [model, setModel] = useState(() => localStorage.getItem("coach_model") || "");
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem("coach_base_url") || "");
  const [tips, setTips] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [matchCount, setMatchCount] = useState(0);

  useEffect(() => {
    invoke("match_history_stats")
      .then(s => setMatchCount(s?.total || 0))
      .catch(() => {});
  }, []);

  const providerCfg = PROVIDERS.find(p => p.id === provider) || PROVIDERS[0];
  const effectiveModel = model || providerCfg.defaultModel;

  const persist = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setTips("");
    try {
      const history = await invoke("match_history_list", { limit: 10 });
      const matches = history?.matches || [];
      if (matches.length === 0) {
        throw "No cached matches yet. Open the Home page to ingest some, then come back.";
      }
      const res = await invoke("coach_analyze", {
        req: {
          provider,
          api_key: apiKey,
          model: effectiveModel,
          base_url: provider === "openai-compat" ? baseUrl : null,
          recent_matches: matches,
        },
      });
      setTips(res?.tips || "(no tips returned)");
    } catch (e) {
      setError(typeof e === "string" ? e : (e?.message || "Analysis failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 gap-4">
      <header>
        <h1 className="text-2xl font-display font-bold text-text-primary">AI Coach</h1>
        <p className="text-xs text-text-muted">
          Send your last 10 matches to your chosen LLM for personalized tips. Uses your own API key — no app cost.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-base-700/60 p-4 space-y-3">
        <h2 className="text-xs font-display font-bold text-text-muted uppercase tracking-wider">Provider</h2>
        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => { setProvider(p.id); persist("coach_provider", p.id); }}
              className={`px-2 py-2 rounded-lg border text-xs font-display font-semibold transition-colors ${provider === p.id ? "border-val-red bg-val-red/10 text-val-red" : "border-border bg-base-600 text-text-primary hover:bg-base-500"}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs text-text-muted">API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => { setApiKey(e.target.value); persist("coach_api_key", e.target.value); }}
            placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
            className="mt-1 w-full px-2 py-1.5 bg-base-600 border border-border rounded text-sm text-text-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted">Model</label>
            <input
              type="text"
              value={model}
              onChange={e => { setModel(e.target.value); persist("coach_model", e.target.value); }}
              placeholder={providerCfg.defaultModel}
              className="mt-1 w-full px-2 py-1.5 bg-base-600 border border-border rounded text-sm text-text-primary font-mono"
            />
          </div>
          {providerCfg.baseUrlEditable && (
            <div>
              <label className="text-xs text-text-muted">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={e => { setBaseUrl(e.target.value); persist("coach_base_url", e.target.value); }}
                placeholder="http://localhost:11434"
                className="mt-1 w-full px-2 py-1.5 bg-base-600 border border-border rounded text-sm text-text-primary font-mono"
              />
            </div>
          )}
        </div>

        <p className="text-[10px] text-text-muted">
          Your key is stored only in localStorage on this machine. Match data sent only to your chosen provider.
          {matchCount > 0 ? ` · ${matchCount} matches in cache` : " · No cached matches yet"}
        </p>
      </section>

      <button
        onClick={handleAnalyze}
        disabled={loading || !apiKey || !connected}
        className="self-start px-4 py-2 rounded-lg border border-val-red/40 bg-val-red/20 text-val-red font-display font-semibold text-sm hover:bg-val-red/30 disabled:opacity-50 transition-colors"
      >
        {loading ? "Analyzing..." : "Analyze last 10 matches"}
      </button>

      {error && (
        <div className="px-3 py-2 rounded-md border border-val-red/40 bg-val-red/10 text-sm text-val-red whitespace-pre-wrap">{error}</div>
      )}

      {tips && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
          className="rounded-xl border border-border bg-base-700/60 p-4"
        >
          <h2 className="text-xs font-display font-bold text-text-muted uppercase tracking-wider mb-2">Coach says</h2>
          <pre className="text-sm text-text-primary whitespace-pre-wrap font-body leading-relaxed">{tips}</pre>
        </motion.div>
      )}
    </div>
  );
}
