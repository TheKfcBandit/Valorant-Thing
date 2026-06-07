import { useEffect, useMemo, useRef } from "react";

// Bundle the long-lived refs that the polling hooks (matchPoller,
// playerPrefetch, discordRPC) all read from, plus the state→ref sync
// effects + localStorage persistence for the values that need both.
//
// The returned bag is wrapped in useMemo so its identity is stable
// across renders — this matters because consumer effects list `refs`
// in their dep arrays. Without the memo, the wrapper object would be
// freshly allocated each render and the consumer effects would tear
// down + restart (Discord RPC 5s interval, prefetch 250ms interval,
// match poller chain) on every App.jsx state tick.
//
// Each inner field is a useRef container (stable already); useMemo
// with `[]` deps just locks the wrapper identity to first render.
export function useSharedRefs({
  initialMapDodge,
  mapDodgeActive,
  autoUnqueue,
  autoRequeue,
  selectDelay,
  lockDelay,
  lockMode,
  splooshimaApiKey,
  splooshimaAvailable,
}) {
  const mapLookup = useRef({});
  const currentMatchMap = useRef(null);
  const notifiedMatch = useRef(null);
  const instalockConfig = useRef({ maps: [], selectedAgent: null, perMapSelections: {} });
  const lockedMatch = useRef(null);
  const lockedAgentName = useRef(null);
  const selectDelayRef = useRef(selectDelay);
  const lockDelayRef = useRef(lockDelay);
  const lockModeRef = useRef(lockMode);
  const pendingLock = useRef(new Map());
  const lastLogKey = useRef(null);
  const mapDodge = useRef(initialMapDodge);
  const dodgedMatch = useRef(null);
  const mapDodgeActiveRef = useRef(mapDodgeActive);
  const gamePhase = useRef(null);
  const rpcMatchInfo = useRef(null);
  const autoUnqueueRef = useRef(autoUnqueue);
  const autoRequeueRef = useRef(autoRequeue);
  const pendingUnqueue = useRef(false);
  const pendingRequeue = useRef(false);
  const prefetchedMatch = useRef(null);
  const splooshimaApiKeyRef = useRef(splooshimaApiKey);
  const splooshimaAvailableRef = useRef(splooshimaAvailable);

  const refs = useMemo(
    () => ({
      mapLookup,
      currentMatchMap,
      notifiedMatch,
      instalockConfig,
      lockedMatch,
      lockedAgentName,
      selectDelay: selectDelayRef,
      lockDelay: lockDelayRef,
      lockMode: lockModeRef,
      pendingLock,
      lastLogKey,
      mapDodge,
      dodgedMatch,
      mapDodgeActive: mapDodgeActiveRef,
      gamePhase,
      rpcMatchInfo,
      autoUnqueue: autoUnqueueRef,
      autoRequeue: autoRequeueRef,
      pendingUnqueue,
      pendingRequeue,
      prefetchedMatch,
      splooshimaApiKey: splooshimaApiKeyRef,
      splooshimaAvailable: splooshimaAvailableRef,
    }),
    []
  );

  useEffect(() => {
    mapDodgeActiveRef.current = mapDodgeActive;
  }, [mapDodgeActive]);
  useEffect(() => {
    autoUnqueueRef.current = autoUnqueue;
    localStorage.setItem("auto_unqueue", String(autoUnqueue));
  }, [autoUnqueue]);
  useEffect(() => {
    autoRequeueRef.current = autoRequeue;
    localStorage.setItem("auto_requeue", String(autoRequeue));
  }, [autoRequeue]);
  useEffect(() => {
    selectDelayRef.current = selectDelay;
    localStorage.setItem("instalock_select_delay", selectDelay);
  }, [selectDelay]);
  useEffect(() => {
    lockDelayRef.current = lockDelay;
    localStorage.setItem("instalock_lock_delay", lockDelay);
  }, [lockDelay]);
  useEffect(() => {
    lockModeRef.current = lockMode;
    localStorage.setItem("instalock_lock_mode", lockMode);
  }, [lockMode]);
  useEffect(() => {
    splooshimaApiKeyRef.current = splooshimaApiKey;
  }, [splooshimaApiKey]);
  useEffect(() => {
    splooshimaAvailableRef.current = splooshimaAvailable;
  }, [splooshimaAvailable]);

  return refs;
}
