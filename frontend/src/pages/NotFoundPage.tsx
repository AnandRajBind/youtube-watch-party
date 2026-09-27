import React from 'react';
import { Link } from 'react-router-dom';
import { FiHome, FiAlertCircle } from 'react-icons/fi';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="flex-1 flex items-center justify-center py-20 px-4">
      <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl border border-slate-800/90 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4">
          <FiAlertCircle className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Page Not Found</h1>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          The page or watch party room you are looking for does not exist or has been removed.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-all duration-150 shadow-md shadow-red-950/40"
        >
          <FiHome className="w-4 h-4" />
          <span>Return to Home</span>
        </Link>
      </div>
    </div>
  );
};
