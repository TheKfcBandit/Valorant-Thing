import {
  Bookmark,
  Check,
  ChevronDown,
  DotsVertical,
  DownloadTray,
  Pencil,
  Plus,
  Share,
  Trash,
  UploadTray,
} from "../../icons";

// Profile dropdown + per-profile dot menu + inline import affordance.
// The 9 callbacks reflect every action this surface can fire; routing
// them through props keeps the parent in control of profile state.
export default function ProfileManager({
  profileMenuRef,
  profileMenuOpen,
  onToggleMenu,
  profiles,
  activeProfile,
  activeProfileId,
  dotMenuId,
  setDotMenuId,
  onSwitchProfile,
  onStartRename,
  onShareProfile,
  onExportProfile,
  onRequestDelete,
  importMode,
  setImportMode,
  importValue,
  setImportValue,
  importError,
  setImportError,
  startImport,
  vtFileRef,
  importProfileFile,
  onStartCreate,
}) {
  return (
    <div className="relative" ref={profileMenuRef}>
      <button
        onClick={onToggleMenu}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-base-700 border border-border rounded-lg text-xs font-display text-text-secondary hover:text-text-primary transition-colors"
      >
        <Bookmark className="shrink-0" />
        <span className="max-w-[100px] truncate">{activeProfile?.name || "Default"}</span>
        <ChevronDown className="shrink-0 text-text-muted" strokeWidth="2.5" />
      </button>
      {profileMenuOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[200px] bg-base-700 border border-border rounded-lg shadow-xl z-20">
          {profiles.map((p) => (
            <div
              key={p.id}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-body hover:bg-base-600 transition-colors ${p.id === activeProfileId ? "text-accent-blue" : "text-text-secondary"}`}
            >
              <span
                className="flex-1 truncate cursor-pointer"
                onClick={() => onSwitchProfile(p.id)}
              >
                {p.name}
              </span>
              {p.id === activeProfileId && <Check className="shrink-0" />}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDotMenuId(dotMenuId === p.id ? null : p.id);
                }}
                className="shrink-0 p-0.5 rounded hover:bg-base-500 text-text-muted hover:text-text-primary transition-colors"
              >
                <DotsVertical />
              </button>
              {dotMenuId === p.id && (
                <ProfileDotMenu
                  profilesCount={profiles.length}
                  onRename={() => onStartRename(p.id)}
                  onShare={() => onShareProfile(p.id)}
                  onExport={() => onExportProfile(p.id)}
                  onDelete={() => onRequestDelete(p.id)}
                />
              )}
            </div>
          ))}
          <div className="border-t border-border" />
          {importMode ? (
            <ImportInline
              value={importValue}
              setValue={setImportValue}
              error={importError}
              setError={setImportError}
              startImport={startImport}
              vtFileRef={vtFileRef}
              importProfileFile={importProfileFile}
              cancel={() => {
                setImportMode(false);
                setImportValue("");
                setImportError("");
              }}
            />
          ) : (
            <>
              <button
                onClick={onStartCreate}
                className="w-full px-3 py-2 text-left text-xs font-body text-text-muted hover:text-text-primary hover:bg-base-600 transition-colors flex items-center gap-2"
              >
                <Plus className="shrink-0" />
                New Profile
              </button>
              <button
                onClick={() => {
                  setImportMode(true);
                  setImportError("");
                }}
                className="w-full px-3 py-2 text-left text-xs font-body text-text-muted hover:text-text-primary hover:bg-base-600 transition-colors flex items-center gap-2"
              >
                <UploadTray className="shrink-0" />
                Import Profile
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ProfileDotMenu({ profilesCount, onRename, onShare, onExport, onDelete }) {
  return (
    <div className="absolute right-2 top-full -mt-0.5 bg-base-600 border border-border rounded-lg shadow-xl z-30 min-w-[130px] overflow-hidden">
      <button
        onClick={onRename}
        className="w-full px-3 py-1.5 text-left text-xs font-body text-text-secondary hover:text-text-primary hover:bg-base-500 transition-colors flex items-center gap-2"
      >
        <Pencil className="shrink-0" />
        Rename
      </button>
      <button
        onClick={onShare}
        className="w-full px-3 py-1.5 text-left text-xs font-body text-text-secondary hover:text-text-primary hover:bg-base-500 transition-colors flex items-center gap-2"
      >
        <Share className="shrink-0" />
        Share Code
      </button>
      <button
        onClick={onExport}
        className="w-full px-3 py-1.5 text-left text-xs font-body text-text-secondary hover:text-text-primary hover:bg-base-500 transition-colors flex items-center gap-2"
      >
        <DownloadTray className="shrink-0" />
        Export File
      </button>
      {profilesCount > 1 && (
        <button
          onClick={onDelete}
          className="w-full px-3 py-1.5 text-left text-xs font-body text-val-red/70 hover:text-val-red hover:bg-base-500 transition-colors flex items-center gap-2"
        >
          <Trash className="shrink-0" />
          Delete
        </button>
      )}
    </div>
  );
}

function ImportInline({
  value,
  setValue,
  error,
  setError,
  startImport,
  vtFileRef,
  importProfileFile,
  cancel,
}) {
  return (
    <div className="px-2.5 py-2 space-y-1.5">
      <div className="flex gap-1.5">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") startImport();
            if (e.key === "Escape") cancel();
          }}
          placeholder="VT-AGENT-XXXXX"
          className="flex-1 min-w-0 bg-base-800 border border-border rounded px-2 py-1 text-xs font-body text-text-primary placeholder:text-text-muted focus:outline-none"
          autoFocus
        />
        <button
          onClick={startImport}
          className="px-2 py-1 bg-accent-blue/20 text-accent-blue rounded text-xs font-body hover:bg-accent-blue/30 transition-colors shrink-0"
        >
          Go
        </button>
      </div>
      {error && <p className="text-[10px] font-body text-val-red px-0.5">{error}</p>}
      <button
        onClick={() => vtFileRef.current?.click()}
        className="w-full text-left text-[10px] font-body text-text-muted hover:text-text-secondary transition-colors px-0.5"
      >
        or import from .vt file
      </button>
      <input
        ref={vtFileRef}
        type="file"
        accept=".vt"
        onChange={importProfileFile}
        className="hidden"
      />
    </div>
  );
}
