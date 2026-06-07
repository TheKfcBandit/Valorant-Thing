import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { register, unregister, isRegistered } from "@tauri-apps/plugin-global-shortcut";

// Register a global hotkey while a pregame match is active. The user
// can rebind via `dodge_keybind` (default Ctrl+D) or disable entirely
// via `dodge_keybind_enabled`.
//
// The shortcut owns the rest of the dodge path: pregame_quit, notification
// emit, and resetting the matched-against state via `setPregameMatchId`.
export function useDodgeKeybind({
  pregameMatchId,
  addLog,
  pushNotification,
  setPregameMatchId,
  lockedMatchRef,
}) {
  useEffect(() => {
    if (!pregameMatchId) return;
    if (localStorage.getItem("dodge_keybind_enabled") === "false") return;
    const keybind = localStorage.getItem("dodge_keybind") || "Ctrl+D";
    let registered = false;

    (async () => {
      try {
        if (await isRegistered(keybind)) await unregister(keybind);
        await register(keybind, async (e) => {
          if (e.state === "Pressed") {
            try {
              await invoke("pregame_quit", { matchId: pregameMatchId });
              addLog("info", `Dodged match via ${keybind}`);
              pushNotification({
                id: `dodge-${pregameMatchId}`,
                type: "dodged",
                reason: "keybind",
                keybind,
              });
              setPregameMatchId(null);
              lockedMatchRef.current = null;
            } catch (err) {
              const msg = typeof err === "string" ? err : err?.message || "Dodge failed";
              addLog("error", `Dodge failed: ${msg}`);
            }
          }
        });
        registered = true;
      } catch (e) {
        console.warn("[App] suppressed:", e);
      }
    })();

    return () => {
      if (registered) unregister(keybind).catch(() => {});
    };
  }, [pregameMatchId, addLog, pushNotification, setPregameMatchId, lockedMatchRef]);
}
