import { useRef } from "react";
import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { readVtFile, exportVtFile } from "../../cloud";
import { Label } from "../ui/Label";
import { CONFIG_KEYS } from "./configKeys";
import { DownloadTray, HeartFilled, Share, UploadTray } from "../../icons";

export function ConfigSection({ onShareConfig, onShareWishlist, onOpenImportCode }) {
  const configVtRef = useRef(null);

  const exportConfigFile = () => {
    const config = {};
    for (const key of CONFIG_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) config[key] = val;
    }
    exportVtFile("config", config, "config.vt");
  };

  const importConfigVt = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const vt = await readVtFile(file);
      if (vt.type !== "config") return;
      for (const key of CONFIG_KEYS) {
        if (key in vt.data) localStorage.setItem(key, vt.data[key]);
      }
      window.location.reload();
    } catch (e) {
      console.warn("[Settings] suppressed:", e);
    }
    e.target.value = "";
  };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="rounded-xl bg-base-700 border border-border divide-y divide-border"
    >
      <div className="px-4 pt-3 pb-1">
        <Label as="h2">Config</Label>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs font-body text-text-muted">
          Share, export, or import your entire configuration including agents, maps, theme, and all
          settings.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onShareConfig}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
          >
            <Share />
            Share Code
          </button>
          <button
            onClick={() => onOpenImportCode("config")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
          >
            <UploadTray />
            Import Code
          </button>
          <button
            onClick={exportConfigFile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
          >
            <DownloadTray />
            Export .vt
          </button>
          <button
            onClick={() => configVtRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
          >
            <UploadTray />
            Import .vt
          </button>
          <input
            ref={configVtRef}
            type="file"
            accept=".vt,.valthing"
            onChange={importConfigVt}
            className="hidden"
          />
        </div>
        <div className="pt-2 mt-1 border-t border-border/40">
          <p className="text-xs font-body text-text-muted mb-2">
            Share your store wishlist (skins you'd like notified about).
          </p>
          <button
            onClick={onShareWishlist}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
          >
            <HeartFilled className="" />
            Share Wishlist
          </button>
        </div>
      </div>
    </motion.div>
  );
}
