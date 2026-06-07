import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Toggle the Rust-side bomb_tracker (memory-scanner) on/off based on
// the user preference, and forward `bomb-planted` events as the 45s
// spike-timer overlay toast.
export function useSpikeTimer({ spikeTimerEnabled, pushNotification }) {
  useEffect(() => {
    if (!spikeTimerEnabled) {
      invoke("stop_bomb_tracker").catch(() => {});
      return;
    }
    invoke("start_bomb_tracker").catch(() => {});
    const unsub = listen("bomb-planted", (event) => {
      if (localStorage.getItem("notifications_enabled") === "false") return;
      if (localStorage.getItem("spike_timer_enabled") === "false") return;
      const epochMs = event.payload?.epochMs ?? Date.now();
      pushNotification({
        id: `spike-${epochMs}`,
        type: "spike",
        totalMs: 45000,
        startTime: epochMs,
      });
    });
    return () => {
      // Stop the Rust memory scanner so it doesn't leak across effect
      // re-runs (pushNotification identity flips) or unmount.
      invoke("stop_bomb_tracker").catch(() => {});
      unsub.then((fn) => fn());
    };
  }, [pushNotification, spikeTimerEnabled]);
}
