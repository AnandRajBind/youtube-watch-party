import React, { useState, useEffect } from 'react';
import {
  FiUsers,
  FiAward,
  FiShield,
  FiUser,
  FiUserMinus,
  FiArrowUpCircle,
  FiArrowDownCircle,
  FiMoreVertical,
  FiX,
  FiShare2,
} from 'react-icons/fi';
import type { SafeParticipantDto, Role } from '../../types/room.types';
import { ConfirmDialog } from './ConfirmDialog';

interface ParticipantsPanelProps {
  participants: SafeParticipantDto[];
  currentUserId?: string;
  isHost: boolean;
  onAssignRole?: (targetUserId: string, newRole: 'moderator' | 'participant') => void;
  onRemoveParticipant?: (targetUserId: string) => void;
  onTransferHost?: (targetUserId: string) => void;
  isDrawer?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({
  participants,
  currentUserId,
  isHost,
  onAssignRole,
  onRemoveParticipant,
  onTransferHost,
  isDrawer = false,
  isOpen = false,
  onClose,
}) => {
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);

  // Close mobile drawer on Escape key
  useEffect(() => {
    if (!isDrawer || !isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawer, isOpen, onClose]);

  // Close active dropdown menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!activeMenuUserId) return;
    const handleClickOutside = () => setActiveMenuUserId(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveMenuUserId(null);
    };
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenuUserId]);

  // Confirmation dialog state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    confirmVariant: 'danger' | 'warning';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    confirmVariant: 'danger',
    onConfirm: () => {},
  });

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'host':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
            <FiAward className="w-3 h-3 text-amber-400" />
            <span>Host</span>
          </span>
        );
      case 'moderator':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30 uppercase tracking-wider">
            <FiShield className="w-3 h-3 text-blue-400" />
            <span>Mod</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700/60 uppercase tracking-wider">
            <FiUser className="w-3 h-3 text-slate-400" />
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

  const promptRemove = (targetUserId: string, username: string) => {
    setActiveMenuUserId(null);
    setConfirmModal({
      isOpen: true,
      title: 'Remove Participant',
      message: `Are you sure you want to remove "${username}" from this watch party? They will be immediately disconnected.`,
      confirmLabel: 'Remove Participant',
      confirmVariant: 'danger',
      onConfirm: () => {
        onRemoveParticipant?.(targetUserId);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const promptTransfer = (targetUserId: string, username: string) => {
    setActiveMenuUserId(null);
    setConfirmModal({
      isOpen: true,
      title: 'Transfer Room Ownership',
      message: `Are you sure you want to transfer Host ownership to "${username}"? You will be demoted to Moderator, and they will gain full administrative authority.`,
      confirmLabel: 'Transfer Ownership',
      confirmVariant: 'warning',
      onConfirm: () => {
        onTransferHost?.(targetUserId);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const onlineCount = participants.filter((p) => p.isOnline).length;

  // Internal content of the participants panel
  const panelContent = (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <FiUsers className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-bold text-white tracking-tight">Participants</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-medium border border-slate-700/60">
            {participants.length}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{onlineCount} online</span>
          </span>

          {isDrawer && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close participants drawer"
            >
              <FiX className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Participant List */}
      <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1 overscroll-contain">
        {participants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div className="w-11 h-11 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
              <FiUsers className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-200 mb-1">No Participants</p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              This room currently has no connected participants.
            </p>
          </div>
        ) : (
          participants.map((p) => {
            const isMe = p.userId === currentUserId;
            // Host actions are ONLY visible to the Host and NEVER for themselves
            const canModerateThisUser = isHost && !isMe;
            const isMenuOpen = activeMenuUserId === p.userId;

            return (
              <div
                key={p.userId}
                className={`relative flex items-center justify-between p-3 rounded-xl border text-xs transition-all ${
                  isMe
                    ? 'bg-slate-950/80 border-slate-700 text-white shadow-xs'
                    : 'bg-slate-950/40 border-slate-850 text-slate-200 hover:border-slate-700/80 hover:bg-slate-900/40'
                }`}
              >
                {/* User Info & Online Status */}
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      p.isOnline ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-slate-600'
                    }`}
                    title={p.isOnline ? 'Online' : 'Offline'}
                    aria-label={p.isOnline ? 'Online' : 'Offline'}
                  />

                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-semibold truncate text-white">{p.username}</span>
                    {isMe && (
                      <span className="text-[10px] text-red-400 font-semibold px-1.5 py-0.2 rounded-full bg-red-500/10 border border-red-500/20 shrink-0">
                        You
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side: Role Badge & Host Actions Menu */}
                <div className="flex items-center gap-2 shrink-0">
                  {getRoleBadge(p.role)}

                  {/* Host-only Action Menu Trigger (NEVER shown to participants) */}
                  {canModerateThisUser && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuUserId(isMenuOpen ? null : p.userId);
                        }}
                        className="w-7 h-7 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors flex items-center justify-center focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-500 cursor-pointer"
                        title="Moderate member"
                        aria-label={`Moderate ${p.username}`}
                        aria-expanded={isMenuOpen}
                      >
                        <FiMoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {/* Dropdown Menu */}
                      {isMenuOpen && (
                        <div
                          className="absolute right-0 top-full mt-1.5 w-48 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl py-1.5 z-30 flex flex-col text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.role === 'participant' ? (
                            <button
                              type="button"
                              onClick={() => handlePromote(p.userId)}
                              className="px-3.5 py-2 text-left hover:bg-slate-800 flex items-center gap-2 text-blue-300 transition-colors cursor-pointer"
                            >
                              <FiArrowUpCircle className="w-3.5 h-3.5" />
                              <span>Promote to Moderator</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDemote(p.userId)}
                              className="px-3.5 py-2 text-left hover:bg-slate-800 flex items-center gap-2 text-slate-300 transition-colors cursor-pointer"
                            >
                              <FiArrowDownCircle className="w-3.5 h-3.5" />
                              <span>Demote to Viewer</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => promptTransfer(p.userId, p.username)}
                            className="px-3.5 py-2 text-left hover:bg-slate-800 flex items-center gap-2 text-amber-300 transition-colors cursor-pointer"
                          >
                            <FiAward className="w-3.5 h-3.5" />
                            <span>Transfer Ownership</span>
                          </button>

                          <div className="border-t border-slate-800 my-1" />

                          <button
                            type="button"
                            onClick={() => promptRemove(p.userId, p.username)}
                            className="px-3.5 py-2 text-left hover:bg-rose-950/40 text-rose-400 flex items-center gap-2 transition-colors cursor-pointer"
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

        {participants.length === 1 && participants[0].userId === currentUserId && (
          <div className="mt-3 p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 text-center flex flex-col items-center gap-2 shadow-inner">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <FiShare2 className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-200">Watching Solo?</span>
            <p className="text-xs text-slate-400 leading-relaxed max-w-[220px]">
              Share the room code or invite link to watch videos with friends in real time.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* 1. Mobile Drawer Mode (Slide-over drawer on small screens) */}
      {isDrawer ? (
        isOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Participants Drawer"
            className="fixed inset-0 z-50 flex justify-end bg-slate-950/80 backdrop-blur-xs transition-opacity lg:hidden"
            onClick={onClose}
          >
            <div
              className="w-full max-w-[85vw] sm:max-w-xs h-full bg-slate-900 border-l border-slate-800 p-4 sm:p-5 shadow-2xl flex flex-col transform transition-transform overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {panelContent}
            </div>
          </div>
        ) : null
      ) : (
        /* 2. Desktop & Tablet Inline Mode (Sidebar card) */
        <div className="bg-slate-900/70 backdrop-blur-md border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col shadow-xl shadow-black/20 h-full w-full overflow-hidden">
          {panelContent}
        </div>
      )}

      {/* Reusable Destructive Action Confirmation Modal */}
      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        confirmVariant={confirmModal.confirmVariant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
};
