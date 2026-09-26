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
} from 'react-icons/fi';
import type { Role } from '../../types/room.types';

interface RoomHeaderProps {
  roomCode: string;
  currentUser: string;
  currentRole: Role;
  participantCount: number;
  socketConnected: boolean;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  roomCode,
  currentUser,
  currentRole,
  participantCount,
  socketConnected,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const roomLink = typeof window !== 'undefined' ? `${window.location.origin}/room/${roomCode}` : '';

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // fallback
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

        {/* Right Actions: Copy Code & Copy Link Buttons */}
        <div className="flex items-center gap-2">
          {/* Copy Code */}
          <button
            type="button"
            onClick={handleCopyCode}
            className="px-2.5 py-1.5 rounded-lg bg-slate-700/70 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors flex items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-slate-500"
            title="Copy Room Code"
            aria-label="Copy Room Code"
          >
            {copiedCode ? <FiCheck className="w-3.5 h-3.5 text-emerald-400" /> : <FiCopy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copiedCode ? 'Code Copied' : 'Copy Code'}</span>
          </button>

          {/* Copy Room Link */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="px-2.5 py-1.5 rounded-lg bg-slate-700/70 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors flex items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-slate-500"
            title="Copy Room Invite Link"
            aria-label="Copy Room Invite Link"
          >
            {copiedLink ? <FiCheck className="w-3.5 h-3.5 text-emerald-400" /> : <FiShare2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
          </button>
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
          <span className="text-slate-400 font-mono">
            {participantCount} {participantCount === 1 ? 'member' : 'members'}
          </span>

          <span className="text-slate-600">•</span>

          <span
            className={`inline-flex items-center gap-1.5 font-medium ${
              socketConnected ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            <FiRadio className={`w-3.5 h-3.5 ${socketConnected ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">
              {socketConnected ? 'Real-Time Sync Active' : 'Connecting...'}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
