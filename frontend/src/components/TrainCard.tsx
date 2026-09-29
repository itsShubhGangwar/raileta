import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Gauge, ShieldCheck, TrainFront } from 'lucide-react';
import { TrainSummary } from '../types/railway';
import { StatusBadge } from './StatusBadge';

interface TrainCardProps {
  train: TrainSummary;
}

export const TrainCard: React.FC<TrainCardProps> = ({ train }) => {
  const isDelayed = train.current_delay_mins > 5;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 hover:border-blue-600/50 shadow-sm hover:shadow-md transition-all duration-200 p-5 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Left: Train Identity & Route */}
        <div className="space-y-3 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0F1F3D] text-white font-mono text-xs font-bold">
              <TrainFront className="w-3.5 h-3.5 text-amber-400" />
              {train.train_number}
            </span>
            <h3 className="text-base sm:text-lg font-bold text-[#0F1F3D] truncate">
              {train.train_name}
            </h3>
            <StatusBadge
              status={isDelayed ? `Delayed (+${train.current_delay_mins}m)` : 'On Time'}
              delayMins={train.current_delay_mins}
              size="sm"
            />
          </div>

          {/* FROM -> TO */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-900">{train.source_name}</span>
              <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                {train.source_code}
              </span>
            </div>

            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />

            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-900">{train.destination_name}</span>
              <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                {train.destination_code}
              </span>
            </div>

            {train.next_station_code && (
              <span className="text-xs text-slate-500 lg:ml-2">
                • Next: <strong className="text-slate-700">{train.next_station_name}</strong> ({train.next_station_code})
              </span>
            )}
          </div>
        </div>

        {/* Center: Speed, Delay, Predicted ETA, Confidence */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 lg:border-l lg:border-r border-slate-100 lg:px-6 shrink-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Gauge className="w-3 h-3 text-slate-400" />
              Current Speed
            </p>
            <p className="text-sm font-bold font-mono text-slate-900 mt-0.5">
              {train.current_speed_kmph} km/h
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              Delay
            </p>
            <p
              className={`text-sm font-bold font-mono mt-0.5 ${
                train.current_delay_mins <= 5 ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              {train.current_delay_mins <= 0 ? 'On Time (0m)' : `+${train.current_delay_mins} min`}
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Predicted ETA
            </p>
            <p className="text-base font-extrabold font-mono text-blue-700 mt-0.5">
              {train.predicted_eta}
            </p>
            <p className="text-[10px] font-mono text-slate-500">{train.prediction_range}</p>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              Confidence
            </p>
            <p className="text-sm font-bold font-mono text-slate-900 mt-0.5">
              {train.prediction_confidence}%
            </p>
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex sm:flex-row lg:flex-col gap-2 shrink-0">
          <Link
            to={`/status/${train.train_number}`}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-sm transition-colors"
          >
            <span>VIEW LIVE STATUS</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            to={`/details/${train.train_number}`}
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors"
          >
            Route Intelligence
          </Link>
        </div>
      </div>
    </div>
  );
};
