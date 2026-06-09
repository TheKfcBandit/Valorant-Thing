import { motion, AnimatePresence } from "framer-motion";
import { X } from "../../icons";
import { FriendInviteCard } from "./FriendInviteCard";

export function InviteFriendsModal({
  open,
  onClose,
  friends,
  friendsLoading,
  friendSearch,
  onSearchChange,
  fitness,
  trackerScores,
  invitingPuuid,
  invitedPuuids,
  onInvite,
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            className="bg-base-700 border border-border rounded-xl w-80 max-h-[420px] shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-3.5 pb-3 border-b border-border shrink-0">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-display font-semibold text-text-primary">
                    Invite to Party
                  </h3>
                  {!friendsLoading && friends.length > 0 && (
                    <span className="text-[10px] font-body text-text-muted">{friends.length}</span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
                >
                  <X size={10} strokeWidth="2.5" />
                </button>
              </div>
              <input
                type="text"
                value={friendSearch}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search..."
                autoFocus
                className="w-full px-2.5 py-1.5 bg-base-600 border border-border rounded-lg text-[11px] font-body text-text-primary placeholder:text-text-muted/40 outline-none focus:border-val-red/60 transition-colors"
              />
            </div>
            <div className="flex-1 overflow-y-auto py-1 min-h-0">
              {friendsLoading ? (
                <div className="px-2 space-y-0.5">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-2.5 px-2 py-2 animate-pulse">
                      <div className="w-6 h-6 rounded-full bg-base-500 shrink-0" />
                      <div className="h-3 w-28 rounded bg-base-500" />
                    </div>
                  ))}
                </div>
              ) : friends.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-text-muted">
                  <p className="text-[11px] font-body">No friends found</p>
                </div>
              ) : (
                friends
                  .filter((f) => {
                    if (!friendSearch.trim()) return true;
                    const q = friendSearch.toLowerCase();
                    return (
                      f.game_name?.toLowerCase().includes(q) ||
                      f.game_tag?.toLowerCase().includes(q)
                    );
                  })
                  .slice()
                  .sort((a, b) => {
                    const fa = fitness[(a.puuid || "").toLowerCase()]?.fitness ?? -1;
                    const fb = fitness[(b.puuid || "").toLowerCase()]?.fitness ?? -1;
                    return fb - fa;
                  })
                  .map((friend, i) => (
                    <FriendInviteCard
                      key={friend.puuid}
                      friend={friend}
                      fitness={fitness[(friend.puuid || "").toLowerCase()]}
                      tracker={trackerScores[(friend.puuid || "").toLowerCase()]}
                      onInvite={() => onInvite(friend)}
                      inviting={invitingPuuid === friend.puuid}
                      invited={invitedPuuids.has(friend.puuid)}
                      index={i}
                    />
                  ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
