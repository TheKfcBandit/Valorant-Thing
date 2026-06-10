import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

// Shared wishlist state: localStorage `wishlist_skins` is the source of
// truth, mirrored to the Rust side via set_wishlist so the storefront
// poller can fire wishlist-hit notifications. Extracted on second use
// (StorePage + AssetsPage); only one page is mounted at a time, so each
// mount re-reads localStorage and there is no cross-page staleness.
export function useWishlist() {
  const [wishlist, setWishlist] = useState(() => {
    try {
      const raw = localStorage.getItem("wishlist_skins");
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(
        (Array.isArray(parsed) ? parsed : [])
          .filter((s) => s != null)
          .map((s) => String(s).toLowerCase())
      );
    } catch {
      return new Set();
    }
  });

  const toggleWishlist = useCallback((uuid) => {
    if (!uuid) return;
    setWishlist((prev) => {
      const next = new Set(prev);
      const k = uuid.toLowerCase();
      if (next.has(k)) next.delete(k);
      else next.add(k);
      const arr = Array.from(next);
      localStorage.setItem("wishlist_skins", JSON.stringify(arr));
      invoke("set_wishlist", { items: arr }).catch((e) =>
        console.warn("[Wishlist] set_wishlist failed:", e)
      );
      return next;
    });
  }, []);

  return { wishlist, toggleWishlist };
}
