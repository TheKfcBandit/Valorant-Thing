import { AlertCircle, ExternalLink, RefreshCcw } from "../../icons";

// Blocking modal shown when Node.js isn't on PATH. Node is a hard runtime
// prerequisite because every Riot HTTP request is shelled out via
// `node -e` from Rust — see riot/http.rs. The modal offers the
// download link and a reload button (a restart is enough to re-check).
export default function NodeJsModal() {
  const openNodeSite = () =>
    import("@tauri-apps/plugin-shell").then((m) => m.open("https://nodejs.org"));

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="max-w-sm p-6 rounded-xl bg-base-700 border border-border shadow-2xl text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-val-red/10 border border-val-red/20 flex items-center justify-center">
          <AlertCircle className="text-val-red" />
        </div>
        <h2 className="text-base font-display font-bold text-text-primary">Node.js Required</h2>
        <p className="text-xs font-body text-text-muted leading-relaxed">
          Valorant Thing requires Node.js to communicate with Riot&apos;s APIs. Install Node.js,
          then restart the app.
        </p>
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            onClick={openNodeSite}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-text-muted/20 text-xs font-display font-medium text-text-primary hover:border-text-muted/40 transition-colors cursor-pointer bg-transparent"
          >
            <ExternalLink />
            Download Node.js
          </button>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-text-muted/20 text-xs font-display font-medium text-text-primary hover:border-text-muted/40 transition-colors cursor-pointer bg-transparent"
          >
            <RefreshCcw />
            Restart App
          </button>
        </div>
      </div>
    </div>
  );
}
