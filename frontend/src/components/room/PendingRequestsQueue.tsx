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
    <div className="bg-slate-800/90 border border-amber-500/40 rounded-xl p-3.5 sm:p-4 shadow-sm flex flex-col gap-2.5">
      <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
        <div className="flex items-center gap-2">
          <FiBell className="w-4 h-4 text-amber-400 animate-bounce" />
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
            Pending Participant Requests ({requests.length})
          </h3>
        </div>
        <span className="text-[11px] text-amber-400/90">Requires Approval</span>
      </div>

      <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
        {requests.map((req) => (
          <div
            key={req.requestId}
            className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 rounded-lg bg-slate-900 border border-slate-700/80 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded bg-slate-800 shrink-0">
                {getActionIcon(req.action)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-white truncate">
                  {req.requesterUsername}
                </span>
                <span className="text-[11px] text-slate-300">
                  {getActionDescription(req)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="button"
                onClick={() => onApprove(req.requestId)}
                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1 transition-colors"
                title="Approve and execute action"
              >
                <FiCheck className="w-3.5 h-3.5" />
                <span>Approve</span>
              </button>

              <button
                type="button"
                onClick={() => onReject(req.requestId)}
                className="px-2.5 py-1 rounded bg-slate-700 hover:bg-rose-700 text-slate-200 hover:text-white font-medium flex items-center gap-1 transition-colors"
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
