import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import appIcon from "../../../src-tauri/icons/icon.png";
import { ArrowRight, ChevronRight, DownloadTray } from "../../icons";
import { renderMarkdownInline } from "../../utils/markdown";

function ReleaseNotesBody({ text }) {
  return (
    <div className="text-xs font-body text-text-muted leading-relaxed whitespace-pre-wrap break-words space-y-1.5">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("### "))
          return (
            <p key={i} className="text-text-secondary font-semibold text-[11px] pt-1.5">
              {renderMarkdownInline(line.slice(4))}
            </p>
          );
        if (line.startsWith("## "))
          return (
            <p key={i} className="text-text-primary font-bold text-xs pt-2">
              {renderMarkdownInline(line.slice(3))}
            </p>
          );
        if (line.startsWith("- "))
          return (
            <p key={i} className="pl-2 flex gap-1.5">
              <span className="text-accent-blue shrink-0">•</span>
              <span>{renderMarkdownInline(line.slice(2))}</span>
            </p>
          );
        if (line.trim() === "") return null;
        return <p key={i}>{renderMarkdownInline(line)}</p>;
      })}
    </div>
  );
}

// Update notification modal. Renders release notes for the new version,
// an expandable "Previous Releases" section, and the install button.
// `updateInfo` shape (from backend `check_for_update`):
//   { current, latest, download_url, asset_name, release_notes,
//     all_releases: [{version, notes}, ...] }
export default function UpdateModal({
  updateInfo,
  updating,
  setUpdating,
  showOlderReleases,
  setShowOlderReleases,
  onClose,
  onSkip,
}) {
  return (
    <motion.div
      key="update-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="max-w-lg w-full rounded-2xl bg-base-800 border border-border shadow-2xl overflow-hidden"
      >
        <div className="px-6 pt-6 pb-4 border-b border-border bg-gradient-to-b from-base-700 to-base-800">
          <div className="flex items-center gap-3 mb-4">
            <img src={appIcon} alt="Valorant Thing" className="w-10 h-10 rounded-xl" />
            <div>
              <h2 className="text-sm font-display font-bold text-text-primary leading-tight">
                Valorant Thing
              </h2>
              <p className="text-[10px] font-body text-text-muted">A new version is available</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-base-600 border border-border text-[11px] font-mono text-text-muted">
              v{updateInfo.current}
            </span>
            <ArrowRight className="text-text-muted/50" />
            <span className="px-2 py-0.5 rounded-md bg-accent-blue/15 border border-accent-blue/25 text-[11px] font-mono text-accent-blue font-semibold">
              v{updateInfo.latest}
            </span>
          </div>
        </div>
        {!updating && (updateInfo.release_notes || updateInfo.all_releases?.length > 1) && (
          <div className="px-6 py-4 border-b border-border">
            <div className="max-h-64 overflow-y-auto pr-1 custom-scrollbar space-y-3">
              {updateInfo.release_notes && (
                <div>
                  <h3 className="text-[11px] font-display font-semibold text-text-secondary mb-2 uppercase tracking-wider">
                    Release Notes — v{updateInfo.latest}
                  </h3>
                  <ReleaseNotesBody text={updateInfo.release_notes} />
                </div>
              )}
              {updateInfo.all_releases?.length > 1 && (
                <div>
                  <button
                    onClick={() => setShowOlderReleases(!showOlderReleases)}
                    className="flex items-center gap-1.5 text-[11px] font-display font-semibold text-text-muted hover:text-text-secondary transition-colors"
                  >
                    <ChevronRight
                      size={10}
                      strokeWidth="2.5"
                      className={`transition-transform duration-150 ${showOlderReleases ? "rotate-90" : ""}`}
                    />
                    Previous Releases ({updateInfo.all_releases.length - 1})
                  </button>
                  {showOlderReleases && (
                    <div className="mt-3 space-y-4 pl-2 border-l border-border/50">
                      {updateInfo.all_releases.slice(1).map((rel, ri) => (
                        <div key={ri}>
                          <h4 className="text-[11px] font-display font-semibold text-text-secondary mb-1.5">
                            v{rel.version}
                          </h4>
                          {rel.notes && <ReleaseNotesBody text={rel.notes} />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="px-6 py-4 flex items-center justify-between">
          {updating ? (
            <div className="flex items-center gap-3 w-full">
              <div className="w-5 h-5 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin shrink-0" />
              <div>
                <p className="text-xs font-display font-semibold text-text-primary">
                  Downloading update...
                </p>
                <p className="text-[10px] font-body text-text-muted">
                  The installer will launch automatically
                </p>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={onSkip}
                className="px-4 py-2 rounded-lg text-[11px] font-display font-medium text-text-muted hover:text-text-secondary hover:bg-base-700 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={async () => {
                  setUpdating(true);
                  try {
                    await invoke("download_and_install_update", {
                      url: updateInfo.download_url,
                      filename: updateInfo.asset_name,
                    });
                  } catch {
                    setUpdating(false);
                  }
                  onClose?.();
                }}
                className="px-5 py-2 rounded-lg bg-accent-blue text-white text-[11px] font-display font-semibold hover:brightness-110 transition-all flex items-center gap-2"
              >
                <DownloadTray size={14} />
                Update Now
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
