import React, { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { FiTv, FiRadio } from 'react-icons/fi';
import { roomApiService } from '../services/api';

export const MainLayout: React.FC = () => {
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    const checkServer = async () => {
      try {
        await roomApiService.checkHealth();
        if (isMounted) setServerOnline(true);
      } catch {
        if (isMounted) setServerOnline(false);
      }
    };

    checkServer();
    const interval = setInterval(checkServer, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100 antialiased">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center text-white shadow-sm">
              <FiTv className="w-5 h-5" />
            </div>
            <div>
              <span className="font-semibold text-lg tracking-tight text-white group-hover:text-red-400 transition-colors">
                WatchParty
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                YouTube
              </span>
            </div>
          </Link>

          {/* Server Connection Status Badge */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-400 bg-slate-800/80 px-2.5 sm:px-3 py-1.5 rounded-full border border-slate-700/50">
              <FiRadio
                className={`w-3.5 h-3.5 shrink-0 ${
                  serverOnline === true
                    ? 'text-emerald-400 animate-pulse'
                    : serverOnline === false
                      ? 'text-rose-400'
                      : 'text-amber-400'
                }`}
              />
              <span>
                {serverOnline === true ? (
                  <>
                    <span className="hidden sm:inline">Backend </span>Connected
                  </>
                ) : serverOnline === false ? (
                  <>
                    <span className="hidden sm:inline">Backend </span>Offline
                  </>
                ) : (
                  'Connecting...'
                )}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-6 md:py-8 flex flex-col">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 bg-slate-950/40 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4">
          YouTube Watch Party — Server-Authoritative Sync Engine
        </div>
      </footer>
    </div>
  );
};
