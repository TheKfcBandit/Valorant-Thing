import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

const noAnim = () => localStorage.getItem("disable_animations") === "true";
const T0 = { duration: 0 };

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

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted mx-auto">
            <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3M8 22h8" />
          </svg>
          <p className="text-sm font-display text-text-muted">Waiting for Valorant</p>
          <p className="text-[11px] font-body text-text-muted/60">Open Valorant to coach your recent matches</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden" animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: noAnim() ? 0 : 0.06 } } }}
      className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 gap-3"
    >
      <header>
        <h1 className="text-2xl font-display font-bold text-text-primary">AI Coach</h1>
        <p className="text-xs text-text-muted">
          Send your last 10 matches to your chosen LLM for personalized tips. Uses your own API key — no app cost.
        </p>
      </header>

      <motion.section
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl border border-border bg-base-700 p-4 space-y-3"
      >
        <h2 className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">Provider</h2>
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
          <label className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => { setApiKey(e.target.value); persist("coach_api_key", e.target.value); }}
            placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
            className="mt-1 w-full px-3 py-2 bg-base-600 border border-border rounded-lg text-sm font-body text-text-primary placeholder:text-text-muted/50 outline-none focus:border-val-red/60 transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">Model</label>
            <input
              type="text"
              value={model}
              onChange={e => { setModel(e.target.value); persist("coach_model", e.target.value); }}
              placeholder={providerCfg.defaultModel}
              className="mt-1 w-full px-3 py-2 bg-base-600 border border-border rounded-lg text-sm text-text-primary font-mono outline-none focus:border-val-red/60 transition-colors"
            />
          </div>
          {providerCfg.baseUrlEditable && (
            <div>
              <label className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={e => { setBaseUrl(e.target.value); persist("coach_base_url", e.target.value); }}
                placeholder="http://localhost:11434"
                className="mt-1 w-full px-3 py-2 bg-base-600 border border-border rounded-lg text-sm text-text-primary font-mono outline-none focus:border-val-red/60 transition-colors"
              />
            </div>
          )}
        </div>

        <p className="text-[10px] text-text-muted">
          Your key is stored only in localStorage on this machine. Match data sent only to your chosen provider.
          {matchCount > 0 ? ` · ${matchCount} matches in cache` : " · No cached matches yet"}
        </p>
      </motion.section>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
      >
        <button
          onClick={handleAnalyze}
          disabled={loading || !apiKey || !connected}
          className="self-start px-4 py-2 rounded-lg border border-val-red/40 bg-val-red/20 text-val-red font-display font-semibold text-sm hover:bg-val-red/30 disabled:opacity-50 transition-colors"
        >
          {loading ? "Analyzing..." : "Analyze last 10 matches"}
        </button>
      </motion.div>

      {error && (
        <div className="px-3 py-2 rounded-md border border-val-red/40 bg-val-red/10 text-sm text-val-red whitespace-pre-wrap">{error}</div>
      )}

      {tips && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={noAnim() ? T0 : { duration: 0.2 }}
          className="rounded-xl border border-border bg-base-700 p-4"
        >
          <h2 className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider mb-2">Coach says</h2>
          <pre className="text-sm text-text-primary whitespace-pre-wrap font-body leading-relaxed">{tips}</pre>
        </motion.div>
      )}
    </motion.div>
  );
}
