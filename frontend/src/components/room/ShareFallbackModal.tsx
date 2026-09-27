import React, { useRef, useEffect } from 'react';
import { FiShare2, FiX, FiCheck, FiCopy } from 'react-icons/fi';

interface ShareFallbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  roomUrl: string;
}

export const ShareFallbackModal: React.FC<ShareFallbackModalProps> = ({
  isOpen,
  onClose,
  roomCode,
  roomUrl,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = React.useState(false);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    } else {
      setSelected(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectAll = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      setSelected(true);
      setTimeout(() => setSelected(false), 2000);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-fallback-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl p-6 sm:p-7 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-400 flex items-center justify-center shrink-0 shadow-xs">
              <FiShare2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="share-fallback-title" className="text-base font-bold text-white tracking-tight">
                Share Watch Party
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Invite friends to join this watch party
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {/* Room Code Display */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Room Code:</span>
          <span className="font-mono text-white font-bold text-sm tracking-widest bg-slate-900 px-3 py-1 rounded-lg border border-slate-700/60">
            {roomCode}
          </span>
        </div>

        {/* Room Link Input & Select */}
        <div>
          <label htmlFor="share-link-input" className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
            Room Invite Link
          </label>
          <div className="flex items-center gap-2">
            <input
              id="share-link-input"
              ref={inputRef}
              type="text"
              readOnly
              value={roomUrl}
              onFocus={(e) => e.target.select()}
              className="w-full h-11 px-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 selection:bg-blue-600 selection:text-white"
            />
            <button
              type="button"
              onClick={handleSelectAll}
              className="h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95 cursor-pointer"
            >
              {selected ? <FiCheck className="w-3.5 h-3.5 text-emerald-400" /> : <FiCopy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{selected ? 'Selected' : 'Select'}</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Copy the link above using <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">Ctrl+C</kbd> (or <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">⌘+C</kbd>) and send it to your friends.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-blue-950/30 active:scale-95 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
