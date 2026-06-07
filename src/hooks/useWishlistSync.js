import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getLevelLookup } from "../valApiSkins";

// Hydrate the backend's wishlist mirror from localStorage on app start
// and every reconnect, and forward `wishlist-hit` events from the
// backend poller as overlay toasts + OS notifications.
//
// The backend keeps its own wishlist set; this hook is just the bridge.
export function useWishlistSync({ status, pushNotification }) {
  const pushWishlistToBackend = useCallback(() => {
    try {
      const raw = localStorage.getItem("wishlist_skins");
      const parsed = raw ? JSON.parse(raw) : [];
      const arr = Array.isArray(parsed)
        ? parsed.filter((s) => s != null).map((s) => String(s))
        : [];
      invoke("set_wishlist", { items: arr }).catch((e) =>
        console.warn("[Wishlist] set_wishlist failed:", e)
      );
    } catch (e) {
      console.warn("[Wishlist] hydrate parse failed:", e);
    }
  }, []);

  // Hydrate on first mount.
  useEffect(() => {
    pushWishlistToBackend();
  }, [pushWishlistToBackend]);

  // Re-hydrate whenever we (re)connect — guards against the poller
  // running its first tick before the initial hydration landed.
  useEffect(() => {
    if (status === "connected") pushWishlistToBackend();
  }, [status, pushWishlistToBackend]);

  useEffect(() => {
    const unsub = listen("wishlist-hit", async (event) => {
      const payload = event.payload || {};
      if (localStorage.getItem("notifications_enabled") === "false") return;
      const offerId = (payload.offer_id || "").toLowerCase();
      const kind = payload.kind || "daily";
      let skinName = null;
      try {
        const lookup = await getLevelLookup();
        skinName = lookup[offerId]?.name || null;
      } catch (e) {
        console.warn("[Wishlist] lookup failed:", e);
      }
      pushNotification({
        id: `wishlist-${kind}-${offerId || Date.now()}`,
        type: "wishlist-hit",
        offerId,
        kind,
        skinName,
      });
      try {
        const { sendNotification } = await import("@tauri-apps/plugin-notification");
        const where = kind === "night-market" ? "Night Market" : "daily store";
        const body = skinName
          ? `${skinName} is in your ${where}.`
          : `A wishlisted skin is in your ${where}.`;
        sendNotification({ title: "Valorant Thing", body });
      } catch (e) {
        console.warn("[Wishlist] OS notification failed:", e);
      }
    });
    return () => {
      unsub.then((fn) => fn());
    };
  }, [pushNotification]);
}
