import React from 'react';
import {
  FiCheckCircle,
  FiAlertTriangle,
  FiAlertCircle,
  FiInfo,
  FiX,
} from 'react-icons/fi';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationItem {
  id: string;
  title?: string;
  message: string;
  type: NotificationType;
}

interface NotificationToastProps {
  notifications: NotificationItem[];
  onDismiss: (id: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notifications,
  onDismiss,
}) => {
  if (notifications.length === 0) return null;

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return <FiCheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />;
      case 'warning':
        return <FiAlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />;
      case 'error':
        return <FiAlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />;
      default:
        return <FiInfo className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />;
    }
  };

  const getContainerStyle = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return 'bg-slate-900/95 border-emerald-500/70 text-slate-100 shadow-emerald-950/20';
      case 'warning':
        return 'bg-slate-900/95 border-amber-500/70 text-slate-100 shadow-amber-950/20';
      case 'error':
        return 'bg-slate-900/95 border-rose-500/70 text-slate-100 shadow-rose-950/20';
      default:
        return 'bg-slate-900/95 border-blue-500/70 text-slate-100 shadow-blue-950/20';
    }
  };

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {notifications.map((n) => (
        <div
          key={n.id}
          role={n.type === 'error' || n.type === 'warning' ? 'alert' : 'status'}
          className={`pointer-events-auto p-3.5 rounded-xl border text-xs shadow-xl flex items-start gap-2.5 transition-all transform animate-in fade-in slide-in-from-bottom-2 duration-200 ${getContainerStyle(
            n.type
          )}`}
        >
          {getIcon(n.type)}

          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            {n.title && (
              <span className="font-semibold text-white tracking-wide text-xs">
                {n.title}
              </span>
            )}
            <span className="leading-relaxed text-slate-200">{n.message}</span>
          </div>

          <button
            type="button"
            onClick={() => onDismiss(n.id)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 focus:outline-none focus:ring-1 focus:ring-slate-500"
            title="Dismiss notification"
            aria-label="Dismiss notification"
          >
            <FiX className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
