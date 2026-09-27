import React, { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { FiTv } from 'react-icons/fi';
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
    <div className="min-h-screen flex flex-col bg-transparent text-slate-100 antialiased selection:bg-rose-500/30 selection:text-white">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-950/75 backdrop-blur-md sticky top-0 z-50 transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Identity */}
          <Link
            to="/"
            className="flex items-center gap-2.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-lg p-1 -m-1"
            aria-label="WatchParty Home"
          >
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center text-white shadow-sm shadow-red-500/20 group-hover:shadow-md group-hover:shadow-red-500/30 group-hover:scale-[1.02] transition-all duration-150">
              <FiTv className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white group-hover:text-red-400 transition-colors">
                WatchParty
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-300 text-[11px] font-medium border border-slate-700/60 tracking-wide">
                YouTube
              </span>
            </div>
          </Link>

          {/* Server Connection Status Badge */}
          <div className="flex items-center gap-3 shrink-0">
            <div
              role="status"
              aria-label={
                serverOnline === true
                  ? 'Backend Server Connected'
                  : serverOnline === false
                    ? 'Backend Server Offline'
                    : 'Connecting to Backend Server'
              }
              className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-all duration-200 ${
                serverOnline === true
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.1)]'
                  : serverOnline === false
                    ? 'border-rose-500/25 bg-rose-500/10 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.1)]'
                    : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
              }`}
            >
              <span className="relative flex h-2 w-2">
                {serverOnline === true && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    serverOnline === true
                      ? 'bg-emerald-400'
                      : serverOnline === false
                        ? 'bg-rose-400'
                        : 'bg-amber-400 animate-pulse'
                  }`}
                />
              </span>
              <span className="font-medium tracking-tight">
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
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 md:py-10 flex flex-col">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-6 bg-slate-950/40 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-slate-400">
            YouTube Watch Party <span className="text-slate-600">•</span> Real-time Playback Synchronization
          </p>
          <div className="flex items-center gap-4 text-slate-500 text-[11px]">
            <span>Low-latency WebSockets</span>
            <span>•</span>
            <span>Server-Authoritative RBAC</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
