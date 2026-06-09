import { useState } from "react";
import { motion } from "framer-motion";
import { open } from "@tauri-apps/plugin-shell";
import { noAnim, T0 } from "../../utils/animation";
import { Label } from "../ui/Label";
import { OpenExternal } from "../../icons";

export function AccountSection({
  oauthSession,
  valorantConnected,
  player,
  onOAuthSignin,
  onOAuthSignout,
  splooshimaApiKey,
  onSplooshimaApiKeyChange,
}) {
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState(null);

  const handleOAuthSignin = async () => {
    setOauthError(null);
    setOauthBusy(true);
    try {
      await onOAuthSignin();
    } catch (e) {
      setOauthError(typeof e === "string" ? e : e?.message || "Sign-in failed");
    } finally {
      setOauthBusy(false);
    }
  };

  const handleOAuthSignout = async () => {
    setOauthError(null);
    setOauthBusy(true);
    try {
      await onOAuthSignout();
    } finally {
      setOauthBusy(false);
    }
  };

  return (
    <>
      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Riot Account (offline mode)</Label>
        </div>
        <div className="p-4 space-y-3">
          {valorantConnected && !oauthSession ? (
            <p className="text-xs font-body text-text-muted">
              Active session from Valorant — sign-in not needed.
            </p>
          ) : valorantConnected && oauthSession ? (
            <>
              <p className="text-xs font-body text-text-muted">
                Signed in as{" "}
                <span className="text-text-primary font-display">
                  {player?.game_name}#{player?.game_tag}
                </span>
                . Live data without Valorant running. Session stays active across app restarts and
                refreshes itself silently — sign out to clear.
              </p>
              <button
                onClick={handleOAuthSignout}
                disabled={oauthBusy}
                className="px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-border bg-base-600 hover:bg-base-500 disabled:opacity-50"
              >
                {oauthBusy ? "Signing out..." : "Sign out"}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs font-body text-text-muted">
                Lets Store, Wrapped, Coach, and Spend tracker show live data when Valorant isn't
                running. Uses Riot's official login page in a popup — your password never touches
                this app.
              </p>
              <button
                onClick={handleOAuthSignin}
                disabled={oauthBusy}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-val-red/40 bg-val-red/20 text-val-red hover:bg-val-red/30 disabled:opacity-50"
              >
                {oauthBusy ? "Opening sign-in..." : "Sign in with Riot"}
              </button>
            </>
          )}
          {oauthError && <p className="text-[11px] font-body text-val-red">{oauthError}</p>}
        </div>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Splooshima API</Label>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs font-body text-text-muted">
            Fallback for player names, levels, and viewing rank information. The app attempts to
            resolve it itself, and Splooshima is used if that fails.
          </p>
          <input
            type="password"
            value={splooshimaApiKey}
            onChange={(e) => onSplooshimaApiKeyChange(e.target.value)}
            placeholder="Your Splooshima API key"
            className="w-full px-3 py-2 bg-base-600 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted/50 outline-none focus:border-val-red/60 transition-colors"
          />
          <button
            onClick={() => open("https://splooshima.com")}
            className="inline-flex items-center gap-1 text-xs font-body text-val-red hover:text-val-red/80 transition-colors"
          >
            Get API key
            <OpenExternal />
          </button>
        </div>
      </motion.div>
    </>
  );
}
