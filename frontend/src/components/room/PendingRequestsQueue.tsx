import React from 'react';
import {
  FiCheck,
  FiX,
  FiBell,
  FiPlay,
  FiPause,
  FiFastForward,
  FiYoutube,
} from 'react-icons/fi';
import type { ActionRequestCreatedPayload } from '../../types/socket.types';
import { formatPlaybackTime } from '../../utils/youtube';

interface PendingRequestsQueueProps {
  requests: ActionRequestCreatedPayload[];
  isHostOrMod: boolean;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}

export const PendingRequestsQueue: React.FC<PendingRequestsQueueProps> = ({
  requests,
  isHostOrMod,
  onApprove,
  onReject,
}) => {
  if (!isHostOrMod || requests.length === 0) {
    return null;
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'play':
        return <FiPlay className="w-3.5 h-3.5 text-emerald-400" />;
      case 'pause':
        return <FiPause className="w-3.5 h-3.5 text-amber-400" />;
      case 'seek':
        return <FiFastForward className="w-3.5 h-3.5 text-blue-400" />;
      case 'change_video':
        return <FiYoutube className="w-3.5 h-3.5 text-red-400" />;
      default:
        return null;
    }
  };

  const getActionDescription = (req: ActionRequestCreatedPayload) => {
    switch (req.action) {
      case 'play':
        return 'Play playback';
      case 'pause':
        return 'Pause playback';
      case 'seek':
        return `Seek to ${formatPlaybackTime(req.time || 0)}`;
      case 'change_video':
        return `Change video to ${req.videoId || 'new video'}`;
      default:
        return req.action;
    }
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-amber-500/30 rounded-2xl p-4 sm:p-5 shadow-xl shadow-amber-950/10 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <FiBell className="w-4 h-4" />
          </div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Pending Participant Requests ({requests.length})
          </h3>
        </div>
        <span className="text-[11px] font-medium text-amber-400 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
          Action Required
        </span>
      </div>

      <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
        {requests.map((req) => (
          <div
            key={req.requestId}
            className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs transition-colors hover:border-slate-700"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                {getActionIcon(req.action)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-white truncate">
                  {req.requesterUsername}
                </span>
                <span className="text-[11px] text-slate-400">
                  {getActionDescription(req)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => onApprove(req.requestId)}
                className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
                title="Approve and execute action"
              >
                <FiCheck className="w-3.5 h-3.5" />
                <span>Approve</span>
              </button>

              <button
                type="button"
                onClick={() => onReject(req.requestId)}
                className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-rose-600 border border-slate-700/60 hover:border-rose-500 text-slate-300 hover:text-white font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                title="Reject request"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Reject</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
