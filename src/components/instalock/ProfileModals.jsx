import { Copy, Pencil, Plus, Share, Trash, UploadTray } from "../../icons";

// The three modals that hang off the profile manager. Hoisted together
// because they share the same overlay shape and rendering position
// (fixed inset-0). Each is independent — the parent state machine
// decides which (if any) is open.

export function ProfileNameModal({ nameModal, nameModalValue, onChange, onCancel, onConfirm }) {
  if (!nameModal) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-base-700 border border-border rounded-xl p-5 max-w-xs w-full space-y-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {nameModal.type === "new" && <Plus size={16} className="text-accent-blue shrink-0" />}
          {nameModal.type === "import" && (
            <UploadTray size={16} className="text-accent-blue shrink-0" />
          )}
          {nameModal.type === "rename" && (
            <Pencil size={16} className="text-accent-blue shrink-0" />
          )}
          <p className="text-sm font-display font-semibold text-text-primary">
            {nameModal.type === "new"
              ? "New Profile"
              : nameModal.type === "import"
                ? "Import Profile"
                : "Rename Profile"}
          </p>
        </div>
        <input
          value={nameModalValue}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nameModalValue.trim()) onConfirm();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Profile name..."
          className="w-full px-3 py-2 bg-base-800 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-light transition-colors"
          autoFocus
        />
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-body bg-base-600 border border-border text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!nameModalValue.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-body bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            {nameModal.type === "rename" ? "Rename" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeleteProfileModal({ targetName, onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-base-700 border border-border rounded-xl p-5 max-w-xs w-full space-y-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Trash size={16} className="text-val-red shrink-0" />
          <p className="text-sm font-display font-semibold text-text-primary">Delete Profile</p>
        </div>
        <p className="text-xs font-body text-text-muted">
          Are you sure you want to delete{" "}
          <span className="text-text-secondary font-semibold">{targetName}</span>?
        </p>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-body bg-base-600 border border-border text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-body bg-val-red/20 text-val-red hover:bg-val-red/30 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShareProfileModal({ shareResult, shareLoading, onCopyCode, onClose }) {
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
          <p className="text-sm font-display font-semibold text-text-primary">Share Profile</p>
        </div>
        {shareLoading && <p className="text-xs font-body text-text-muted">Generating code...</p>}
        {shareResult?.code && (
          <>
            <div className="flex items-center gap-2 bg-base-800 border border-border rounded-lg px-3 py-2">
              <code className="text-sm font-mono text-accent-blue flex-1">{shareResult.code}</code>
              <button
                onClick={onCopyCode}
                className="text-text-muted hover:text-text-primary transition-colors shrink-0"
              >
                <Copy />
              </button>
            </div>
            {shareResult.copied && (
              <p className="text-[10px] font-body text-status-green">Copied to clipboard!</p>
            )}
            <p className="text-[10px] font-body text-text-muted">Code expires in 14 days</p>
          </>
        )}
        {shareResult?.error && (
          <p className="text-xs font-body text-val-red">{shareResult.error}</p>
        )}
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
