// Menu-video config can arrive in two on-disk shapes — the legacy
// single-destPath form (old releases) or the current replacedFiles[]
// array. This normalizes both into the array shape so callers don't
// branch.
export function normalizeMenuVideoConfig(config) {
  if (!config || typeof config !== "object") return null;

  if (Array.isArray(config.replacedFiles)) {
    return {
      sourceBackupPath: config.sourceBackupPath || config.backupPath || "",
      replacedFiles: config.replacedFiles
        .filter((file) => file?.destPath)
        .map((file) => ({
          destPath: file.destPath,
          hash: file.hash || "",
        })),
    };
  }

  if (config.destPath) {
    return {
      sourceBackupPath: config.backupPath || "",
      replacedFiles: [{ destPath: config.destPath, hash: config.hash || "" }],
    };
  }

  return null;
}
