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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 sm:p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <FiShare2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="share-fallback-title" className="text-base font-semibold text-white">
                Share Watch Party
              </h3>
              <p className="text-xs text-slate-400">
                Invite friends to join this watch party
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {/* Room Code Display */}
        <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Room Code:</span>
          <span className="font-mono text-white font-bold text-sm tracking-wider">
            {roomCode}
          </span>
        </div>

        {/* Room Link Input & Select */}
        <div>
          <label htmlFor="share-link-input" className="block text-xs font-medium text-slate-300 mb-1.5">
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
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500 selection:bg-blue-600 selection:text-white"
            />
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              {selected ? <FiCheck className="w-3.5 h-3.5 text-emerald-400" /> : <FiCopy className="w-3.5 h-3.5" />}
              <span>{selected ? 'Selected' : 'Select All'}</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            Select the link above and press <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">Ctrl+C</kbd> (or <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">⌘+C</kbd>) to copy.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
