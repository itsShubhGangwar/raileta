import React from 'react';
import { TrainFront } from 'lucide-react';

interface LoadingStateProps {
  title?: string;
  subtitle?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  title = 'Synchronizing Live Railway Telemetry...',
  subtitle = 'Fetching GPS block coordinates, CRIS section logs, and computing GBDT arrival forecasts.',
}) => {
  return (
    <div className="w-full py-16 px-6 flex flex-col items-center justify-center text-center bg-white rounded-3xl border border-slate-200/80 shadow-rail-card">
      <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-900 to-indigo-800 text-white shadow-lg mb-5">
        <TrainFront className="w-8 h-8 animate-bounce" />
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500"></span>
        </span>
      </div>
      <h3 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h3>
      <p className="text-sm text-slate-500 max-w-md mt-1.5">{subtitle}</p>
      <div className="w-56 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-6">
        <div className="h-full bg-gradient-to-r from-blue-700 via-indigo-600 to-amber-500 w-2/3 animate-pulse rounded-full" />
      </div>
    </div>
  );
};
