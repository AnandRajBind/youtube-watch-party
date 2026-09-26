import React, { useState } from 'react';
import {
  FiUsers,
  FiAward,
  FiShield,
  FiUser,
  FiUserMinus,
  FiArrowUpCircle,
  FiArrowDownCircle,
  FiMoreVertical,
} from 'react-icons/fi';
import type { SafeParticipantDto, Role } from '../../types/room.types';

interface ParticipantsPanelProps {
  participants: SafeParticipantDto[];
  currentUserId?: string;
  isHost: boolean;
  onAssignRole?: (targetUserId: string, newRole: 'moderator' | 'participant') => void;
  onRemoveParticipant?: (targetUserId: string) => void;
  onTransferHost?: (targetUserId: string) => void;
}

export const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({
  participants,
  currentUserId,
  isHost,
  onAssignRole,
  onRemoveParticipant,
  onTransferHost,
}) => {
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'host':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase">
            <FiAward className="w-3 h-3 text-amber-400" />
            <span>Host</span>
          </span>
        );
      case 'moderator':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30 uppercase">
            <FiShield className="w-3 h-3 text-blue-400" />
            <span>Mod</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700 uppercase">
            <FiUser className="w-3 h-3 text-slate-500" />
            <span>Viewer</span>
          </span>
        );
    }
  };

  const handlePromote = (targetUserId: string) => {
    onAssignRole?.(targetUserId, 'moderator');
    setActiveMenuUserId(null);
  };

  const handleDemote = (targetUserId: string) => {
    onAssignRole?.(targetUserId, 'participant');
    setActiveMenuUserId(null);
  };

  const handleRemove = (targetUserId: string, username: string) => {
    if (window.confirm(`Are you sure you want to remove ${username} from the room?`)) {
      onRemoveParticipant?.(targetUserId);
    }
    setActiveMenuUserId(null);
  };

  const handleTransfer = (targetUserId: string, username: string) => {
    if (
      window.confirm(
        `Are you sure you want to transfer Host ownership to ${username}? You will become a Moderator.`
      )
    ) {
      onTransferHost?.(targetUserId);
    }
    setActiveMenuUserId(null);
  };

  const onlineCount = participants.filter((p) => p.isOnline).length;

  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 sm:p-5 flex flex-col shadow-sm h-full">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700/60">
        <div className="flex items-center gap-2">
          <FiUsers className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-white">Participants</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-mono">
            {participants.length}
          </span>
        </div>

        <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{onlineCount} online</span>
        </span>
      </div>

      {/* Participant List */}
      <div className="flex flex-col gap-2 overflow-y-auto max-h-80 sm:max-h-96 pr-1">
        {participants.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No participants joined yet.</p>
        ) : (
          participants.map((p) => {
            const isMe = p.userId === currentUserId;
            const canModerateThisUser = isHost && !isMe;
            const isMenuOpen = activeMenuUserId === p.userId;

            return (
              <div
                key={p.userId}
                className={`relative flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors ${
                  isMe
                    ? 'bg-slate-900/90 border-slate-700 text-white shadow-xs'
                    : 'bg-slate-900/50 border-slate-800 text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      p.isOnline ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-slate-600'
                    }`}
                    title={p.isOnline ? 'Online' : 'Offline'}
                  />

                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-medium truncate">{p.username}</span>
                    {isMe && (
                      <span className="text-[10px] text-red-400 font-mono font-semibold px-1 rounded bg-red-500/10">
                        (You)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {getRoleBadge(p.role)}

                  {/* Host Moderation Controls */}
                  {canModerateThisUser && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setActiveMenuUserId(isMenuOpen ? null : p.userId)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        title="Member actions"
                        aria-label="Member actions"
                      >
                        <FiMoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {isMenuOpen && (
                        <div
                          className="absolute right-0 top-full mt-1 w-44 bg-slate-850 border border-slate-700 rounded-lg shadow-xl py-1 z-30 flex flex-col text-xs text-slate-200"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.role === 'participant' ? (
                            <button
                              type="button"
                              onClick={() => handlePromote(p.userId)}
                              className="px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2 text-blue-300"
                            >
                              <FiArrowUpCircle className="w-3.5 h-3.5" />
                              <span>Promote to Moderator</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDemote(p.userId)}
                              className="px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2 text-slate-300"
                            >
                              <FiArrowDownCircle className="w-3.5 h-3.5" />
                              <span>Demote to Viewer</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleTransfer(p.userId, p.username)}
                            className="px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2 text-amber-300"
                          >
                            <FiAward className="w-3.5 h-3.5" />
                            <span>Transfer Host</span>
                          </button>

                          <div className="border-t border-slate-700/60 my-1" />

                          <button
                            type="button"
                            onClick={() => handleRemove(p.userId, p.username)}
                            className="px-3 py-1.5 text-left hover:bg-rose-950/40 text-rose-400 flex items-center gap-2"
                          >
                            <FiUserMinus className="w-3.5 h-3.5" />
                            <span>Remove from Room</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
