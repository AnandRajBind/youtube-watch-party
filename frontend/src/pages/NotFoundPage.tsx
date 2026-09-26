import React from 'react';
import { Link } from 'react-router-dom';
import { FiHome, FiAlertCircle } from 'react-icons/fi';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="flex-1 flex items-center justify-center py-20">
      <div className="max-w-md w-full bg-slate-800/80 border border-slate-700 rounded-xl p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center mx-auto mb-4">
          <FiAlertCircle className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Page Not Found</h1>
        <p className="text-slate-400 text-sm mb-6">
          The page or watch party room you are looking for does not exist.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
        >
          <FiHome className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
      </div>
    </div>
  );
};
