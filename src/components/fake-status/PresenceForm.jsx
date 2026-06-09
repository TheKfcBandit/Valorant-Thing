import { motion } from "framer-motion";
import Tooltip from "../Tooltip";
import { ALL_QUEUES as QUEUES } from "../../utils/queues";
import {
  rankIcon,
  RANKS,
  PREMIER_DIVISIONS,
  STATUS_MODES,
  SESSION_STATES,
} from "../../utils/fakeStatus";
import { CustomSelect, Field, NumInput, inputClass } from "./FormControls";
import { ApiSearch } from "./ApiSearch";

export function PresenceForm({ presence, update }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="flex-1 overflow-y-auto space-y-3 pr-1"
    >
      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.2 }}
        className="p-4 rounded-xl bg-base-700 border border-border space-y-4"
      >
        <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">
          Status
        </h3>
        <CustomSelect
          value={
            presence.statusMode === "away" && presence.sessionLoopState === "INGAME"
              ? "online"
              : presence.statusMode
          }
          onChange={(v) => update("statusMode", v)}
          options={STATUS_MODES.filter(
            (m) => !(m.id === "away" && presence.sessionLoopState === "INGAME")
          )}
          renderOption={(m) => (
            <span className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${m.id === "online" ? "bg-status-green" : m.id === "away" ? "bg-yellow-400" : "bg-text-muted/40"}`}
              />
              {m.name}
              {m.id === "hidden" && (
                <Tooltip text="Hides you from the friends list entirely">
                  <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-base-500/50 text-[8px] font-bold text-text-muted/70 cursor-help leading-none ml-0.5">
                    ?
                  </span>
                </Tooltip>
              )}
              {m.id === "invisible" && (
                <Tooltip text="Appear offline to friends while staying connected to chat (XMPP unavailable)">
                  <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-base-500/50 text-[8px] font-bold text-text-muted/70 cursor-help leading-none ml-0.5">
                    ?
                  </span>
                </Tooltip>
              )}
            </span>
          )}
        />
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.2 }}
        className="p-4 rounded-xl bg-base-700 border border-border space-y-4"
      >
        <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">
          Rank & Identity
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Rank">
            <CustomSelect
              value={presence.competitiveTier}
              onChange={(v) => update("competitiveTier", v)}
              options={RANKS}
              renderOption={(r) => (
                <>
                  <img src={rankIcon(r.tier)} alt="" className="w-5 h-5" />
                  {r.name}
                </>
              )}
            />
          </Field>
          <Field label="Rank #">
            <NumInput
              value={presence.leaderboardPosition}
              onChange={(v) => update("leaderboardPosition", v)}
              placeholder="0"
              className={inputClass}
            />
          </Field>
          <Field label="Account Level">
            <NumInput
              value={presence.accountLevel}
              onChange={(v) => update("accountLevel", v)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Card" tooltip="Only visible to other players">
            <ApiSearch
              value={presence.playerCardId}
              onChange={(v) => update("playerCardId", v)}
              endpoint="playercards"
              nameKey="displayName"
              iconKey="smallArt"
              placeholder="Search card..."
            />
          </Field>
          <Field label="Nametag" tooltip="Only visible to other players">
            <ApiSearch
              value={presence.playerTitleId}
              onChange={(v) => update("playerTitleId", v)}
              endpoint="playertitles"
              nameKey="titleText"
              placeholder="Search title..."
            />
          </Field>
        </div>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.2 }}
        className="p-4 rounded-xl bg-base-700 border border-border space-y-4"
      >
        <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">
          Game State
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Session State">
            <CustomSelect
              value={presence.sessionLoopState}
              onChange={(v) => update("sessionLoopState", v)}
              options={SESSION_STATES}
              renderOption={(s) => s.name}
            />
          </Field>
          <Field label="Queue">
            <CustomSelect
              value={presence.queueId}
              onChange={(v) => update("queueId", v)}
              options={QUEUES}
              renderOption={(q) => q.label}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Party Size">
            <NumInput
              value={presence.partySize}
              onChange={(v) => update("partySize", v)}
              className={inputClass}
            />
          </Field>
          <Field label="Max Party Size">
            <NumInput
              value={presence.maxPartySize}
              onChange={(v) => update("maxPartySize", v)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Team Score">
            <NumInput
              value={presence.partyOwnerMatchScoreAllyTeam}
              onChange={(v) => update("partyOwnerMatchScoreAllyTeam", v)}
              className={inputClass}
            />
          </Field>
          <Field label="Enemy Score">
            <NumInput
              value={presence.partyOwnerMatchScoreEnemyTeam}
              onChange={(v) => update("partyOwnerMatchScoreEnemyTeam", v)}
              className={inputClass}
            />
          </Field>
        </div>
      </motion.div>

      <div className="p-4 rounded-xl bg-base-700 border border-border space-y-4">
        <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">
          Premier
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Division">
            <CustomSelect
              value={presence.premierDivision}
              onChange={(v) => update("premierDivision", v)}
              options={PREMIER_DIVISIONS}
              renderOption={(d) => (
                <>
                  <span
                    className="w-5 h-5 flex items-center justify-center rounded text-xs font-bold shrink-0"
                    style={{ color: d.color }}
                  >
                    {d.icon}
                  </span>
                  {d.name}
                </>
              )}
            />
          </Field>
          <Field label="Roster Name">
            <input
              value={presence.rosterName}
              onChange={(e) => update("rosterName", e.target.value)}
              placeholder="Team name..."
              className={inputClass}
            />
          </Field>
          <Field label="Score">
            <NumInput
              value={presence.premierScore}
              onChange={(v) => update("premierScore", v)}
              className={inputClass}
            />
          </Field>
        </div>
      </div>
    </motion.div>
  );
}
