import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiArrowLeft,
  FiCopy,
  FiCheck,
  FiShare2,
  FiAward,
  FiShield,
  FiUser,
  FiRadio,
  FiUsers,
  FiRefreshCw,
} from 'react-icons/fi';
import type { Role } from '../../types/room.types';
import { copyToClipboard, getRoomShareUrl } from '../../utils/clipboard';
import { ShareFallbackModal } from './ShareFallbackModal';

interface RoomHeaderProps {
  roomCode: string;
  currentUser: string;
  currentRole: Role;
  participantCount: number;
  socketConnected: boolean;
  isReconnecting?: boolean;
  onReconnect?: () => void;
  onOpenParticipants?: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  roomCode,
  currentUser,
  currentRole,
  participantCount,
  socketConnected,
  isReconnecting = false,
  onReconnect,
  onOpenParticipants,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isFallbackModalOpen, setIsFallbackModalOpen] = useState(false);

  const roomLink = getRoomShareUrl(roomCode);

  const handleCopyCode = async () => {
    const success = await copyToClipboard(roomCode);
    if (success) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } else {
      setIsFallbackModalOpen(true);
    }
  };

  const handleCopyLink = async () => {
    const success = await copyToClipboard(roomLink);
    if (success) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } else {
      setIsFallbackModalOpen(true);
    }
  };

  const renderRoleBadge = () => {
    switch (currentRole) {
      case 'host':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <FiAward className="w-3.5 h-3.5 text-amber-400" />
            <span>Host</span>
          </span>
        );
      case 'moderator':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30">
            <FiShield className="w-3.5 h-3.5 text-blue-400" />
            <span>Moderator</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700/60">
            <FiUser className="w-3.5 h-3.5 text-slate-400" />
            <span>Participant</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900/70 backdrop-blur-md border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl shadow-black/20 flex flex-col gap-3.5">
      {/* Top row: Navigation, Room Code & Share Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Back button & Room Code */}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white transition-all flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 active:scale-95"
            title="Leave Watch Party"
            aria-label="Leave Watch Party"
          >
            <FiArrowLeft className="w-4 h-4" />
          </Link>

          <div className="flex items-center gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Room</span>
            <span className="font-mono text-base sm:text-lg font-bold text-white tracking-widest bg-slate-950/70 border border-slate-800 px-3 py-1 rounded-xl shadow-inner">
              {roomCode}
            </span>
          </div>
        </div>

        {/* Right Actions: Copy Code, Copy Link, and Mobile Participants Button */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Mobile Participants Drawer Trigger */}
          {onOpenParticipants && (
            <button
              type="button"
              onClick={onOpenParticipants}
              className="lg:hidden h-9 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 text-xs font-medium transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer active:scale-95"
              title="View Participants"
              aria-label="View Participants"
            >
              <FiUsers className="w-3.5 h-3.5 text-blue-400" />
              <span>{participantCount}</span>
            </button>
          )}

          {/* Copy Code */}
          <button
            type="button"
            onClick={handleCopyCode}
            className={`h-9 px-3 rounded-xl border text-xs font-medium transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 cursor-pointer active:scale-95 ${
              copiedCode
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 focus-visible:ring-emerald-500'
                : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/60 text-slate-200 hover:text-white focus-visible:ring-slate-500'
            }`}
            title="Copy Room Code"
            aria-label={copiedCode ? 'Room code copied to clipboard' : 'Copy Room Code'}
          >
            {copiedCode ? <FiCheck className="w-3.5 h-3.5 text-emerald-400" /> : <FiCopy className="w-3.5 h-3.5 text-slate-400" />}
            <span className="hidden sm:inline">{copiedCode ? 'Code Copied' : 'Copy Code'}</span>
          </button>

          {/* Copy Room Link */}
          <button
            type="button"
            onClick={handleCopyLink}
            className={`h-9 px-3.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 cursor-pointer active:scale-95 ${
              copiedLink
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 focus-visible:ring-emerald-500'
                : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 border-red-500/80 text-white shadow-md shadow-red-950/30 focus-visible:ring-red-500'
            }`}
            title="Copy Room Invite Link"
            aria-label={copiedLink ? 'Room link copied to clipboard' : 'Copy Room Link'}
          >
            {copiedLink ? <FiCheck className="w-3.5 h-3.5 text-emerald-400" /> : <FiShare2 className="w-3.5 h-3.5 text-white" />}
            <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
          </button>

          {/* Screen reader live announcement */}
          <span className="sr-only" role="status" aria-live="polite">
            {copiedLink ? 'Room link copied to clipboard' : copiedCode ? 'Room code copied to clipboard' : ''}
          </span>
        </div>
      </div>

      {/* Bottom Sub-row: User Info, Role Badge, and Real-Time Sync State */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <span className="text-slate-400">You:</span>
          <span className="font-semibold text-white truncate max-w-[140px] sm:max-w-[200px]">{currentUser}</span>
          {renderRoleBadge()}
        </div>

        {/* Sync Status & Participant Count */}
        <div className="flex items-center gap-3">
          {onOpenParticipants ? (
            <button
              type="button"
              onClick={onOpenParticipants}
              className="lg:hidden text-slate-300 hover:text-white font-mono flex items-center gap-1.5 transition-colors focus:outline-none focus:underline cursor-pointer"
              title="Open participants panel"
            >
              <FiUsers className="w-3.5 h-3.5 text-blue-400" />
              <span>{participantCount} {participantCount === 1 ? 'member' : 'members'}</span>
            </button>
          ) : (
            <span className="lg:hidden text-slate-400 font-mono">
              {participantCount} {participantCount === 1 ? 'member' : 'members'}
            </span>
          )}

          <span className="hidden lg:inline text-slate-400 font-mono">
            {participantCount} {participantCount === 1 ? 'member' : 'members'}
          </span>

          <span className="text-slate-700">•</span>

          {socketConnected ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline">Sync Active</span>
            </span>
          ) : isReconnecting ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border border-amber-500/25 bg-amber-500/10 text-amber-300">
              <FiRefreshCw className="w-3 h-3 animate-spin text-amber-400" />
              <span className="hidden sm:inline">Reconnecting...</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border border-rose-500/25 bg-rose-500/10 text-rose-300">
              <FiRadio className="w-3 h-3 text-rose-400" />
              <span className="hidden sm:inline">Disconnected</span>
              {onReconnect && (
                <button
                  type="button"
                  onClick={onReconnect}
                  className="underline hover:text-rose-200 ml-0.5 font-semibold cursor-pointer"
                >
                  Retry
                </button>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Fallback Share Modal when Clipboard API is unavailable/blocked */}
      <ShareFallbackModal
        isOpen={isFallbackModalOpen}
        onClose={() => setIsFallbackModalOpen(false)}
        roomCode={roomCode}
        roomUrl={roomLink}
      />
    </div>
  );
};
