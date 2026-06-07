import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen, emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { buildNotifThemePayload } from "../themes";

const NOTIF_W = 340;
const NOTIF_H = 500;
const MARGIN = 16;

async function resolveMonitor(screenPref) {
  try {
    if (screenPref === "game") {
      const raw = await invoke("get_valorant_monitor");
      return JSON.parse(raw);
    }
    if (screenPref === "app") {
      const raw = await invoke("get_valorant_monitor").catch(() => null);
      let mon = raw ? JSON.parse(raw) : { x: 0, y: 0, width: screen.width, height: screen.height };
      try {
        const m = await getCurrentWindow().currentMonitor();
        if (m)
          mon = {
            x: m.position.x,
            y: m.position.y,
            width: m.size.width,
            height: m.size.height,
          };
      } catch (e) {
        console.warn("[App] suppressed:", e);
      }
      return mon;
    }
    if (screenPref.startsWith("monitor:")) {
      const idx = parseInt(screenPref.split(":")[1], 10);
      const raw = await invoke("list_monitors");
      const list = JSON.parse(raw);
      const m = list[idx];
      if (m) return { x: m.x, y: m.y, width: m.width, height: m.height };
    }
  } catch (e) {
    console.warn("[App] suppressed:", e);
  }
  return { x: 0, y: 0, width: screen.width, height: screen.height };
}

// Notification overlay window manager.
//
// Owns the lifecycle of the secondary transparent webview that renders
// match-found / locking / locked / dodge / wishlist / spike toasts.
// Exposes:
//   - `pushNotification(data)` — fire-and-forget. Creates the window on
//     first call, queues payloads until the overlay signals `notif-ready`,
//     then forwards live.
//   - `destroyNotifWindow()` — called by SettingsPage when the user
//     toggles notifications off or changes position/screen (the window
//     can't reposition itself, so we tear it down and let the next
//     push rebuild it).
export function useNotificationOverlay({ addLog }) {
  const notifWindowRef = useRef(null);
  const overlayReadyRef = useRef(false);
  const creatingWindowRef = useRef(false);
  const pendingNotifsRef = useRef([]);

  useEffect(() => {
    const unsubPromise = listen("notif-ready", () => {
      overlayReadyRef.current = true;
      const queue = pendingNotifsRef.current;
      pendingNotifsRef.current = [];
      addLog("info", `[Notif] Overlay ready, flushing ${queue.length} queued`);
      if (queue.length > 0 && notifWindowRef.current) {
        emitTo("notification-overlay", "notif-theme", buildNotifThemePayload()).catch(() => {});
        for (const n of queue) {
          emitTo("notification-overlay", "notif-push", n).catch(() => {});
        }
      }
    });
    return () => {
      unsubPromise.then((fn) => fn());
    };
  }, [addLog]);

  const pushNotification = useCallback(
    (data) => {
      const pos = localStorage.getItem("notification_position") || "top-right";
      const payload = { ...data, position: pos };

      if (notifWindowRef.current && overlayReadyRef.current) {
        emitTo("notification-overlay", "notif-theme", buildNotifThemePayload()).catch(() => {});
        emitTo("notification-overlay", "notif-push", payload)
          .then(() => addLog("info", `[Notif] Pushed ${data.type} to overlay`))
          .catch((e) => addLog("error", `[Notif] Push failed: ${e}`));
        return;
      }

      pendingNotifsRef.current.push(payload);

      if (notifWindowRef.current || creatingWindowRef.current) {
        addLog(
          "info",
          `[Notif] Queued ${data.type} (window ${creatingWindowRef.current ? "creating" : "not ready"})`
        );
        return;
      }

      creatingWindowRef.current = true;
      addLog("info", "[Notif] Creating overlay window");
      (async () => {
        try {
          const existing = await WebviewWindow.getByLabel("notification-overlay");
          if (existing) {
            notifWindowRef.current = existing;
            overlayReadyRef.current = true;
            creatingWindowRef.current = false;
            emitTo("notification-overlay", "notif-theme", buildNotifThemePayload()).catch(() => {});
            const q = pendingNotifsRef.current;
            pendingNotifsRef.current = [];
            for (const n of q) emitTo("notification-overlay", "notif-push", n).catch(() => {});
            return;
          }
        } catch (e) {
          console.warn("[App] suppressed:", e);
        }

        const screenPref = localStorage.getItem("notification_screen") || "game";
        const mon = await resolveMonitor(screenPref);
        const isRight = pos.includes("right");
        const isBottom = pos.includes("bottom");
        const winX = isRight ? mon.x + mon.width - NOTIF_W - MARGIN : mon.x + MARGIN;
        const winY = isBottom ? mon.y + mon.height - NOTIF_H - MARGIN : mon.y + MARGIN;

        const win = new WebviewWindow("notification-overlay", {
          url: "index.html?notification",
          title: "VT Notification",
          width: NOTIF_W,
          height: NOTIF_H,
          decorations: false,
          transparent: true,
          shadow: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          focusable: false,
          resizable: false,
          x: winX,
          y: winY,
          visible: false,
        });
        notifWindowRef.current = win;
        // Window is constructed but not yet emitting `notif-ready` —
        // overlayReadyRef stays false (set by the listener at the top
        // of the hook), but creating is done.
        creatingWindowRef.current = false;
        win.once("tauri://error", (e) => {
          addLog("error", `[Notif] Window error: ${JSON.stringify(e)}`);
          notifWindowRef.current = null;
          overlayReadyRef.current = false;
          creatingWindowRef.current = false;
        });
        win.once("tauri://destroyed", () => {
          notifWindowRef.current = null;
          overlayReadyRef.current = false;
          creatingWindowRef.current = false;
        });
      })();
    },
    [addLog]
  );

  const destroyNotifWindow = useCallback(() => {
    if (notifWindowRef.current) {
      try {
        notifWindowRef.current.destroy();
      } catch (e) {
        console.warn("[App] suppressed:", e);
      }
      notifWindowRef.current = null;
      overlayReadyRef.current = false;
      creatingWindowRef.current = false;
    }
  }, []);

  return { pushNotification, destroyNotifWindow };
}
