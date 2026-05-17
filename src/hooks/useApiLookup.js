import { useEffect, useState } from "react";

// Bridge between the singleton-memoized getters in valApiSkins.js and
// React state. Each component that needs a lookup calls useApiLookup with
// the relevant getter; the singleton ensures only one fetch flies regardless
// of how many cards/pages mount.
//
// Returns {} (not null) so consumers can do `lookup[key]?.foo` without
// guarding the lookup itself.
export function useApiLookup(getter) {
  const [v, setV] = useState(null);
  useEffect(() => {
    let alive = true;
    getter().then((r) => { if (alive) setV(r); }).catch(() => {});
    return () => { alive = false; };
  }, [getter]);
  return v || {};
}
