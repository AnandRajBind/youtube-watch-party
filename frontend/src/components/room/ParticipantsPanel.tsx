import React from 'react';
import { FiUsers, FiAward, FiShield, FiUser } from 'react-icons/fi';
import type { SafeParticipantDto, Role } from '../../types/room.types';

interface ParticipantsPanelProps {
  participants: SafeParticipantDto[];
  currentUserId?: string;
}

export const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({
  participants,
  currentUserId,
}) => {
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
            return (
              <div
                key={p.userId}
                className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors ${
                  isMe
                    ? 'bg-slate-900/90 border-slate-700 text-white shadow-xs'
                    : 'bg-slate-900/50 border-slate-800 text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  {/* Online/Offline Status Dot */}
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      p.isOnline ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-slate-600'
                    }`}
                    title={p.isOnline ? 'Online' : 'Offline'}
                  />

                  {/* Username with (You) tag */}
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-medium truncate">{p.username}</span>
                    {isMe && (
                      <span className="text-[10px] text-red-400 font-mono font-semibold px-1 rounded bg-red-500/10">
                        (You)
                      </span>
                    )}
                  </div>
                </div>

                {/* Role Badge */}
                <div className="shrink-0">{getRoleBadge(p.role)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
