import { useState } from "react";
import { Crown as CrownIcon, Person, X } from "../../icons";

export function MemberCard({ member, isLeader, isMe, onKick }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-base-700 border border-border group">
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-base-500 shrink-0">
        {member.player_card_url && !imgError ? (
          <img
            src={member.player_card_url}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Person size={18} className="text-text-muted" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {member.is_owner && <CrownIcon size={12} />}
          <p className="text-sm font-display font-medium text-text-primary truncate">
            {member.incognito ? "Anonymous" : member.game_name}
          </p>
          {!member.incognito && (
            <span className="text-xs font-body text-text-muted">#{member.game_tag}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {!member.hide_account_level && (
            <span className="text-[11px] font-body text-text-muted">Lv {member.account_level}</span>
          )}
          {member.is_ready && (
            <span className="text-[11px] font-body text-status-green">Ready</span>
          )}
        </div>
      </div>

      {isLeader && !isMe && (
        <button
          onClick={onKick}
          title="Kick"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-status-red hover:bg-status-red/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
