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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <FiAward className="w-3.5 h-3.5 text-amber-400" />
            <span>Host</span>
          </span>
        );
      case 'moderator':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
            <FiShield className="w-3.5 h-3.5 text-blue-400" />
            <span>Moderator</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            <FiUser className="w-3.5 h-3.5 text-slate-400" />
            <span>Participant</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 sm:p-4 shadow-sm flex flex-col gap-3">
      {/* Top row: Navigation, Room Code & Share Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Back button & Room Code */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Link
            to="/"
            className="p-2 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
            title="Leave Watch Party"
            aria-label="Leave Watch Party"
          >
            <FiArrowLeft className="w-4 h-4" />
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Room</span>
              <span className="text-base sm:text-lg font-bold font-mono text-white tracking-wider">
                {roomCode}
              </span>
            </div>
          </div>
        </div>

        {/* Right Actions: Copy Code, Copy Link, and Mobile Participants Button */}
        <div className="flex items-center gap-2">
          {/* Mobile Participants Drawer Trigger */}
          {onOpenParticipants && (
            <button
              type="button"
              onClick={onOpenParticipants}
              className="lg:hidden px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium transition-colors flex items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 focus:outline-none focus:ring-1 ${
              copiedCode
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 focus:ring-emerald-500'
                : 'bg-slate-700/70 hover:bg-slate-700 border-slate-600/50 text-slate-200 focus:ring-slate-500'
            }`}
            title="Copy Room Code"
            aria-label={copiedCode ? 'Room code copied to clipboard' : 'Copy Room Code'}
          >
            {copiedCode ? <FiCheck className="w-3.5 h-3.5 text-emerald-400" /> : <FiCopy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copiedCode ? 'Code Copied!' : 'Copy Code'}</span>
          </button>

          {/* Copy Room Link */}
          <button
            type="button"
            onClick={handleCopyLink}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 focus:outline-none focus:ring-1 shadow-xs ${
              copiedLink
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 focus:ring-emerald-500'
                : 'bg-blue-600 hover:bg-blue-500 border-blue-500 text-white focus:ring-blue-400'
            }`}
            title="Copy Room Invite Link"
            aria-label={copiedLink ? 'Room link copied to clipboard' : 'Copy Room Link'}
          >
            {copiedLink ? <FiCheck className="w-3.5 h-3.5 text-emerald-400" /> : <FiShare2 className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
          </button>

          {/* Screen reader live announcement */}
          <span className="sr-only" role="status" aria-live="polite">
            {copiedLink ? 'Room link copied to clipboard' : copiedCode ? 'Room code copied to clipboard' : ''}
          </span>
        </div>
      </div>

      {/* Bottom Sub-row: User Info, Role Badge, and Real-Time Sync State */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-slate-700/60 text-xs">
        <div className="flex items-center gap-3">
          {/* Current User and Role */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">You:</span>
            <span className="font-semibold text-white truncate max-w-[140px] sm:max-w-[200px]">{currentUser}</span>
            {renderRoleBadge()}
          </div>
        </div>

        {/* Sync Status & Participant Count */}
        <div className="flex items-center gap-3">
          {onOpenParticipants ? (
            <button
              type="button"
              onClick={onOpenParticipants}
              className="lg:hidden text-slate-300 hover:text-white font-mono flex items-center gap-1.5 transition-colors focus:outline-none focus:underline"
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

          <span className="text-slate-600">•</span>

          {socketConnected ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
              <FiRadio className="w-3.5 h-3.5 animate-pulse" />
              <span className="hidden sm:inline">Sync Active</span>
            </span>
          ) : isReconnecting ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-400">
              <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">Reconnecting...</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-medium text-rose-400">
              <FiRadio className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Disconnected</span>
              {onReconnect && (
                <button
                  type="button"
                  onClick={onReconnect}
                  className="underline hover:text-rose-300 ml-0.5 text-xs font-semibold focus:outline-none"
                >
                  (Retry)
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
