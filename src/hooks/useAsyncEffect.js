import { useEffect } from "react";

// Replaces the `let cancelled = false; ...; return () => { cancelled = true; };`
// IIFE pattern that was copy-pasted across 10+ effects in the codebase.
//
// The async function receives an `isCancelled` predicate that callers
// check after each await to bail out cleanly on unmount:
//
//   useAsyncEffect(async (isCancelled) => {
//     const data = await invoke("...");
//     if (isCancelled()) return;
//     setState(data);
//   }, [deps]);
//
// Unhandled rejections are logged via a tagged console.warn (per
// philosophy rule 4) so a forgotten try/catch isn't completely silent.
export function useAsyncEffect(fn, deps) {
  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    Promise.resolve()
      .then(() => fn(isCancelled))
      .catch((e) => console.warn("[useAsyncEffect]", e));
    return () => {
      cancelled = true;
    };
  }, deps);
}
