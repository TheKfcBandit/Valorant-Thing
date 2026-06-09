import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { PARTY_QUEUES as QUEUES } from "../../utils/queues";
import {
  ChevronDown,
  Grid4,
  Link,
  LogIn,
  Play,
  Square,
  UserPlus,
  Users as UsersIcon,
  X,
} from "../../icons";

export function PartyControls({
  party,
  isLeader,
  isCustom,
  currentQueueLabel,
  changingQueue,
  queueing,
  onToggleAccessibility,
  onChangeQueue,
  onQueueAction,
  onOpenInvite,
  onOpenJoin,
  onGenerateCode,
  partyCode,
  codeCopied,
  onCopyCode,
  onDisableCode,
}) {
  const [showQueuePicker, setShowQueuePicker] = useState(false);
  const queuePickerRef = useRef(null);

  useEffect(() => {
    if (!showQueuePicker) return;
    const handler = (e) => {
      if (queuePickerRef.current && !queuePickerRef.current.contains(e.target))
        setShowQueuePicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showQueuePicker]);

  return (
    <>
      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <UsersIcon size={16} className="text-text-muted" />
          <h2 className="text-sm font-display font-semibold text-text-primary">Party</h2>
          <span className="text-xs font-body text-text-muted">{party.members.length}/5</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isLeader ? (
            <button
              onClick={onToggleAccessibility}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-body transition-colors ${
                party.accessibility === "OPEN"
                  ? "text-status-green bg-status-green/10 hover:bg-status-green/20"
                  : "text-status-red bg-status-red/10 hover:bg-status-red/20"
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${party.accessibility === "OPEN" ? "bg-status-green" : "bg-status-red"}`}
              />
              {party.accessibility === "OPEN" ? "Open" : "Closed"}
            </button>
          ) : (
            <>
              <div
                className={`w-1.5 h-1.5 rounded-full ${party.accessibility === "OPEN" ? "bg-status-green" : "bg-status-red"}`}
              />
              <span className="text-xs font-body text-text-muted">
                {party.accessibility === "OPEN" ? "Open" : "Closed"}
              </span>
            </>
          )}
        </div>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="relative"
        ref={queuePickerRef}
      >
        {isLeader ? (
          <button
            onClick={() => setShowQueuePicker((p) => !p)}
            disabled={changingQueue}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-base-700 border border-border text-xs font-body text-text-primary hover:bg-base-600 transition-colors w-full"
          >
            <Grid4 className="text-text-muted shrink-0" />
            <span className="font-display font-medium">
              {changingQueue ? "..." : currentQueueLabel}
            </span>
            <ChevronDown className="text-text-muted ml-auto shrink-0" />
          </button>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-base-700/50 border border-border text-xs font-body text-text-muted">
            <Grid4 strokeWidth="1.5" className="shrink-0" />
            <span>{currentQueueLabel}</span>
          </div>
        )}
        <AnimatePresence>
          {showQueuePicker && isLeader && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute z-40 top-full left-0 mt-1 w-48 bg-base-700 border border-border rounded-lg shadow-xl overflow-hidden"
            >
              {QUEUES.map((q) => (
                <button
                  key={q.id}
                  onClick={() => {
                    onChangeQueue(q.id);
                    setShowQueuePicker(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-display transition-colors ${
                    (q.id === "custom" ? isCustom : !isCustom && party?.queue_id === q.id)
                      ? "text-val-red bg-val-red/10 font-semibold"
                      : "text-text-primary hover:bg-base-600"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="flex items-center gap-2 flex-wrap"
      >
        {isLeader && (
          <button
            disabled={queueing}
            onClick={onQueueAction}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-body transition-colors disabled:opacity-50 ${
              party.state === "MATCHMAKING"
                ? "bg-status-red/15 border-status-red/30 text-status-red hover:bg-status-red/25"
                : "bg-val-red/15 border-val-red/30 text-val-red hover:bg-val-red/25"
            }`}
          >
            {party.state === "MATCHMAKING" ? (
              <>
                <Square />
                {queueing ? "..." : "Leave Queue"}
              </>
            ) : (
              <>
                <Play />
                {queueing ? "..." : isCustom ? "Start" : "Queue"}
              </>
            )}
          </button>
        )}
        <button
          onClick={onOpenInvite}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
        >
          <UserPlus />
          Invite
        </button>
        <button
          onClick={onOpenJoin}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
        >
          <LogIn />
          Join Code
        </button>
        <button
          onClick={onGenerateCode}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
        >
          <Link />
          Get Code
        </button>
      </motion.div>

      {partyCode && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-base-700 border border-border">
          <span className="text-xs font-body text-text-muted">Party Code:</span>
          <code className="text-xs font-body text-text-primary font-medium tracking-wider">
            {partyCode}
          </code>
          <button
            onClick={onCopyCode}
            className="text-xs font-body text-val-red hover:text-val-red/80 transition-colors"
          >
            {codeCopied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={onDisableCode}
            className="ml-auto w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-status-red hover:bg-status-red/10 transition-colors"
            title="Delete code"
          >
            <X size={10} />
          </button>
        </div>
      )}
    </>
  );
}
