import { Copy, Share, UploadTray } from "../../icons";

export function ShareCodeModal({ shareModal, shareLoading, onClose, onCopied }) {
  if (!shareModal && !shareLoading) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-base-700 border border-border rounded-xl p-5 max-w-xs w-full space-y-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Share size={16} className="text-accent-blue shrink-0" />
          <p className="text-sm font-display font-semibold text-text-primary">Share Code</p>
        </div>
        {shareLoading && <p className="text-xs font-body text-text-muted">Generating code...</p>}
        {shareModal?.code && (
          <>
            <div className="flex items-center gap-2 bg-base-800 border border-border rounded-lg px-3 py-2">
              <code className="text-sm font-mono text-accent-blue flex-1">{shareModal.code}</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareModal.code);
                  onCopied();
                }}
                className="text-text-muted hover:text-text-primary transition-colors shrink-0"
              >
                <Copy />
              </button>
            </div>
            {shareModal.copied && (
              <p className="text-[10px] font-body text-status-green">Copied to clipboard!</p>
            )}
            <p className="text-[10px] font-body text-text-muted">Code expires in 14 days</p>
          </>
        )}
        {shareModal?.error && <p className="text-xs font-body text-val-red">{shareModal.error}</p>}
        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-body bg-base-600 border border-border text-text-secondary hover:text-text-primary transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function ImportCodeModal({
  importCodeModal,
  importCodeValue,
  importCodeError,
  onValueChange,
  onImport,
  onClose,
}) {
  if (!importCodeModal) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-base-700 border border-border rounded-xl p-5 max-w-xs w-full space-y-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <UploadTray size={16} className="text-accent-blue shrink-0" />
          <p className="text-sm font-display font-semibold text-text-primary">Import Code</p>
        </div>
        <input
          value={importCodeValue}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onImport();
            if (e.key === "Escape") onClose();
          }}
          placeholder={importCodeModal === "config" ? "VT-CFG-XXXXX" : "VT-THEME-XXXXX"}
          className="w-full px-3 py-2 bg-base-800 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-light transition-colors"
          autoFocus
        />
        {importCodeError && <p className="text-[10px] font-body text-val-red">{importCodeError}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-body bg-base-600 border border-border text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onImport}
            disabled={!importCodeValue.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-body bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
