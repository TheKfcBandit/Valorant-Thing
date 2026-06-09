import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { computeFitness } from "../squadAnalytics";
import { aggregateMatches, computeTrackerScore } from "../utils/trackerScore";
import { noAnim, T0 } from "../utils/animation";
import { getMapLookup, getGameModeLookup } from "../valApiSkins";
import { normalizeModeKey } from "../utils/gameMode";
import { PARTY_QUEUES as QUEUES } from "../utils/queues";
import { InfoCircle, WifiSlash } from "../icons";
import { PartyControls } from "./party/PartyControls";
import { CustomGameSetup } from "./party/CustomGameSetup";
import { MemberCard } from "./party/MemberCard";
import { InviteFriendsModal } from "./party/InviteFriendsModal";
import { QueueErrorModal, JoinPartyModal } from "./party/PartyModals";

const POLL_INTERVAL = 3000;

export default function PartyPage({ connected, addLog, onRefresh }) {
  const [party, setParty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showJoin, setShowJoin] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [fitness, setFitness] = useState({});
  // #11: per-friend TRN-style score from the match-details disk cache.
  // Sparse — only friends who've appeared in matches the user has opened
  // in details have a score. Empty entries fall through to a muted "—".
  const [trackerScores, setTrackerScores] = useState({});
  const [invitingPuuid, setInvitingPuuid] = useState(null);
  const [invitedPuuids, setInvitedPuuids] = useState(new Set());
  const [friendSearch, setFriendSearch] = useState("");
  const [queueing, setQueueing] = useState(false);
  const [queueError, setQueueError] = useState(null);
  const [changingQueue, setChangingQueue] = useState(false);
  const [customConfigs, setCustomConfigs] = useState(null);
  const [savingCustom, setSavingCustom] = useState(false);
  const [apiMaps, setApiMaps] = useState(null);
  const [apiModes, setApiModes] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [partyCode, setPartyCode] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const cancelledRef = useRef(false);

  const isLeader = party?.members?.some((m) => m.puuid === party.my_puuid && m.is_owner);

  const fetchParty = async () => {
    try {
      const raw = await invoke("get_party");
      if (cancelledRef.current) return;
      addLog?.("info", "[Party] Response", raw);
      const data = JSON.parse(raw);
      if (!data.members || data.members.length === 0) {
        throw new Error("Empty party data — token may be stale");
      }
      data.members.sort((a, b) => (b.is_owner ? 1 : 0) - (a.is_owner ? 1 : 0));
      setParty(data);
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      const msg = typeof e === "string" ? e : e?.message || "Failed to fetch party";
      addLog?.("error", `[Party] ${msg}`);
      if (msg.includes("No party ID") || msg.includes("token may be stale")) {
        addLog?.("info", "[Party] Bad data — refreshing token...");
        onRefresh?.();
        return;
      }
      setError(msg);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    cancelledRef.current = false;
    if (!connected) {
      setParty(null);
      setLoading(false);
      setError("Not connected");
      return;
    }
    fetchParty();
    const interval = setInterval(fetchParty, POLL_INTERVAL);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [connected]);

  const handleKick = async (puuid) => {
    try {
      await invoke("kick_from_party", { targetPuuid: puuid });
      fetchParty();
    } catch (e) {
      console.warn("[Party] suppressed:", e);
    }
  };

  const handleGenerateCode = async () => {
    try {
      const raw = await invoke("generate_party_code");
      const data = JSON.parse(raw);
      const code = data?.InviteCode || data?.inviteCode || "";
      setPartyCode(code);
    } catch (e) {
      console.warn("[Party] suppressed:", e);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    try {
      addLog?.("info", `[Party] Joining by code: ${joinCode.trim()}`);
      await invoke("join_party_by_code", { code: joinCode.trim() });
      addLog?.("info", "[Party] Join by code succeeded");
      setShowJoin(false);
      setJoinCode("");
      fetchParty();
    } catch (e) {
      addLog?.("error", `[Party] Join by code failed: ${e}`);
    }
  };

  const fetchFriends = async () => {
    setFriendsLoading(true);
    try {
      const raw = await invoke("get_friends");
      const data = JSON.parse(raw);
      setFriends(data || []);
      const online = (data || []).filter((f) => f.status && f.status !== "offline");
      const withCard = online.filter((f) => f.player_card_url);
      addLog?.(
        "info",
        `[Friends] Loaded ${(data || []).length} friends — ${online.length} online, ${withCard.length} with card`
      );
      online.slice(0, 10).forEach((f) => {
        addLog?.(
          "info",
          `[Friends] ${f.game_name}#${f.game_tag} status=${f.status} lv=${f.account_level} card=${!!f.player_card_url} product=${f.product}`
        );
      });
      // Compute fitness from local match cache.
      const puuids = (data || []).map((f) => f.puuid).filter(Boolean);
      try {
        const history = await invoke("match_history_list", { limit: 200 });
        const matches = history?.matches || [];
        setFitness(computeFitness(matches, puuids));
      } catch {
        // Cache may not have any entries yet — that's fine.
        setFitness({});
      }
      // #11: friend tracker scores from the match-details cache. Best
      // effort: if the cache is empty (user hasn't opened any matches in
      // details yet) we just won't have scores, which the card handles.
      try {
        const raw = await invoke("get_player_match_summaries", { puuids });
        const byPuuid = JSON.parse(raw);
        const scores = {};
        for (const [puuid, list] of Object.entries(byPuuid || {})) {
          scores[puuid.toLowerCase()] = computeTrackerScore(aggregateMatches(list));
        }
        setTrackerScores(scores);
      } catch {
        setTrackerScores({});
      }
    } catch (e) {
      addLog?.("error", `[Party] Failed to fetch friends: ${e}`);
      setFriends([]);
    }
    setFriendsLoading(false);
  };

  const openInviteModal = () => {
    setShowInvite(true);
    setInvitedPuuids(new Set());
    setFriendSearch("");
    fetchFriends();
  };

  const handleInvite = async (friend) => {
    setInvitingPuuid(friend.puuid);
    try {
      await invoke("invite_to_party", { name: friend.game_name, tag: friend.game_tag });
      setInvitedPuuids((prev) => new Set([...prev, friend.puuid]));
      addLog?.("info", `[Party] Invited ${friend.game_name}#${friend.game_tag}`);
    } catch (e) {
      addLog?.("error", `[Party] Invite failed: ${e}`);
    }
    setInvitingPuuid(null);
  };

  const handleCopyCode = () => {
    if (!partyCode) return;
    navigator.clipboard.writeText(partyCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  };

  const handleChangeQueue = async (queueId) => {
    setChangingQueue(true);
    try {
      await invoke("change_queue", { queueId });
      addLog?.("info", `[Party] Changed queue to ${queueId}`);
      fetchParty();
    } catch (e) {
      addLog?.("error", `[Party] Queue change failed: ${e}`);
    }
    setChangingQueue(false);
  };

  const handleToggleAccessibility = async () => {
    try {
      await invoke("set_party_accessibility", { open: party.accessibility !== "OPEN" });
      fetchParty();
    } catch (e) {
      console.warn("[Party] suppressed:", e);
    }
  };

  const handleQueueAction = async () => {
    setQueueing(true);
    try {
      if (isCustom) await invoke("start_custom_game_match");
      else if (party.state === "MATCHMAKING") await invoke("leave_queue");
      else await invoke("enter_queue");
      fetchParty();
    } catch (e) {
      const msg = typeof e === "string" ? e : e?.message || "";
      if (msg.includes("QUEUE_RESTRICTED"))
        setQueueError(
          "You are currently queue restricted (banned). Wait for your penalty to expire."
        );
      else if (msg.includes("403")) setQueueError("Unable to join queue — you may be restricted.");
      else
        setQueueError(msg || isCustom ? "Failed to start custom game." : "Failed to join queue.");
    }
    setQueueing(false);
  };

  const handleDisableCode = async () => {
    try {
      await invoke("disable_party_code");
      setPartyCode("");
    } catch (e) {
      console.warn("[Party] suppressed:", e);
    }
  };

  const fetchCustomConfigs = async () => {
    try {
      const raw = await invoke("get_custom_configs");
      setCustomConfigs(JSON.parse(raw));
    } catch (e) {
      addLog?.("error", `[Party] Failed to fetch custom configs: ${e}`);
    }
  };

  const handleCustomSetting = async (overrides = {}) => {
    if (!party) return;
    setSavingCustom(true);
    const p = {
      map: party.custom_map || customConfigs?.maps?.[0] || "",
      mode: party.custom_mode || customConfigs?.modes?.[0] || "",
      pod: party.custom_pod || customConfigs?.pods?.[0] || "",
      allowCheats: party.custom_allow_cheats || false,
      playOutAllRounds: party.custom_play_out_all_rounds || false,
      skipMatchHistory: party.custom_skip_match_history || false,
      tournamentMode: party.custom_tournament_mode || false,
      overtimeWinByTwo: party.custom_overtime_win_by_two !== false,
      ...overrides,
    };
    addLog?.("info", "[Custom] Sending settings", p);
    try {
      await invoke("set_custom_settings", p);
      addLog?.("info", `[Custom] OK`);
      fetchParty();
    } catch (e) {
      addLog?.("error", `[Custom] Failed: ${e}`);
    }
    setSavingCustom(false);
  };

  const isCustom = party?.state === "CUSTOM_GAME_SETUP";
  const currentQueueLabel = isCustom
    ? "Custom"
    : QUEUES.find((q) => q.id === normalizeModeKey(party?.queue_id))?.label ||
      QUEUES.find((q) => q.id === party?.queue_id)?.label ||
      party?.queue_id ||
      "Unknown";

  useEffect(() => {
    if (isCustom && !customConfigs) fetchCustomConfigs();
    if (isCustom && !apiMaps) {
      getMapLookup()
        .then(setApiMaps)
        .catch(() => {});
    }
    if (isCustom && !apiModes) {
      getGameModeLookup()
        .then(setApiModes)
        .catch(() => {});
    }
  }, [isCustom]);

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <WifiSlash />
          <p className="text-sm font-display text-text-muted">Waiting for Valorant</p>
          <p className="text-[11px] font-body text-text-muted/60">
            Open Valorant and it will connect automatically
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col min-h-0 p-5 gap-3 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-base-600" />
            <div className="h-4 w-12 rounded bg-base-600" />
            <div className="h-3 w-6 rounded bg-base-600" />
          </div>
          <div className="h-4 w-14 rounded bg-base-600" />
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-xl bg-base-700 border border-border"
            >
              <div className="w-10 h-10 rounded-lg bg-base-600 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-28 rounded bg-base-600" />
                <div className="h-2.5 w-16 rounded bg-base-600" />
              </div>
              <div className="h-5 w-16 rounded bg-base-600" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !party) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <InfoCircle className="text-text-muted mx-auto" />
          <p className="text-sm font-display text-text-muted">No party found</p>
          <p className="text-xs font-body text-text-muted/60">Make sure Valorant is open</p>
        </div>
      </div>
    );
  }

  if (!party?.members?.length) return null;

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: noAnim() ? 0 : 0.04 } } }}
      className="flex-1 flex flex-col min-h-0 p-5 gap-3 overflow-y-auto"
    >
      <PartyControls
        party={party}
        isLeader={isLeader}
        isCustom={isCustom}
        currentQueueLabel={currentQueueLabel}
        changingQueue={changingQueue}
        queueing={queueing}
        onToggleAccessibility={handleToggleAccessibility}
        onChangeQueue={handleChangeQueue}
        onQueueAction={handleQueueAction}
        onOpenInvite={openInviteModal}
        onOpenJoin={() => setShowJoin(true)}
        onGenerateCode={handleGenerateCode}
        partyCode={partyCode}
        codeCopied={codeCopied}
        onCopyCode={handleCopyCode}
        onDisableCode={handleDisableCode}
      />

      {isCustom && isLeader && customConfigs && (
        <CustomGameSetup
          party={party}
          customConfigs={customConfigs}
          savingCustom={savingCustom}
          apiMaps={apiMaps}
          apiModes={apiModes}
          onChangeSetting={handleCustomSetting}
        />
      )}

      <div className="space-y-1.5">
        {party.members.map((member, i) => (
          <motion.div
            key={member.puuid}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={noAnim() ? T0 : { duration: 0.2, delay: i * 0.05 }}
          >
            <MemberCard
              member={member}
              isLeader={isLeader}
              isMe={member.puuid === party.my_puuid}
              onKick={() => handleKick(member.puuid)}
            />
          </motion.div>
        ))}
      </div>

      <QueueErrorModal queueError={queueError} onClose={() => setQueueError(null)} />

      <JoinPartyModal
        open={showJoin}
        joinCode={joinCode}
        onJoinCodeChange={setJoinCode}
        onJoin={handleJoin}
        onClose={() => {
          setShowJoin(false);
          setJoinCode("");
        }}
      />

      <InviteFriendsModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        friends={friends}
        friendsLoading={friendsLoading}
        friendSearch={friendSearch}
        onSearchChange={setFriendSearch}
        fitness={fitness}
        trackerScores={trackerScores}
        invitingPuuid={invitingPuuid}
        invitedPuuids={invitedPuuids}
        onInvite={handleInvite}
      />
    </motion.div>
  );
}
