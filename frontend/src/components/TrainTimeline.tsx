import React from 'react';
import {
  CheckCircle2,
  Clock,
  Flag,
  MapPin,
  Navigation,
  Radio,
  TrainFront,
} from 'lucide-react';
import { StationStop } from '../types/railway';

interface TrainTimelineProps {
  stops: StationStop[];
  previousStationName: string;
  previousStationCode: string;
  nextStationName: string;
  nextStationCode: string;
  currentSpeedKmph: number;
  currentDelayMins: number;
  distanceCoveredKm: number;
  totalDistanceKm: number;
}

export const TrainTimeline: React.FC<TrainTimelineProps> = ({
  stops,
  previousStationName,
  previousStationCode,
  nextStationName,
  nextStationCode,
  currentSpeedKmph,
  currentDelayMins,
  distanceCoveredKm,
  totalDistanceKm,
}) => {
  const destinationStop = stops[stops.length - 1];
  const upcomingCount = stops.filter(
    (s) => s.status === 'Approaching' || s.status === 'Upcoming'
  ).length;

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-rail-card space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200/60">
            Live Corridor Progression
          </span>
          <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1.5">
            Previous Station → Current Position → Upcoming Stations → Destination
          </h3>
        </div>
        <div className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-3.5 py-2 rounded-xl border border-slate-200/80">
          {distanceCoveredKm} km / {totalDistanceKm} km ({Math.round((distanceCoveredKm / Math.max(1, totalDistanceKm)) * 100)}%)
        </div>
      </div>

      {/* 4-Stage Summary Flow (Previous -> Current -> Upcoming -> Destination) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Previous Station */}
        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
              1. Previous Station
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-base font-extrabold text-slate-900">{previousStationName}</p>
          <p className="text-xs font-mono font-semibold text-emerald-700 mt-0.5">
            Station Code: {previousStationCode} • Departed
          </p>
        </div>

        {/* 2. Current Position */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-900 to-indigo-900 text-white shadow-md relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 bg-white/10 px-2 py-0.5 rounded flex items-center gap-1">
              <Radio className="w-3 h-3 animate-pulse" />
              2. Current Position
            </span>
            <TrainFront className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-base font-extrabold text-white">
            In Section ({previousStationCode} → {nextStationCode})
          </p>
          <p className="text-xs font-mono text-blue-200 mt-0.5">
            Speed: {currentSpeedKmph} km/h •{' '}
            {currentDelayMins <= 0 ? 'On Time' : `Delay +${currentDelayMins}m`}
          </p>
        </div>

        {/* 3. Upcoming Stations */}
        <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
              3. Upcoming Stations ({upcomingCount})
            </span>
            <Navigation className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-base font-extrabold text-slate-900">Next: {nextStationName}</p>
          <p className="text-xs font-mono font-semibold text-amber-800 mt-0.5">
            Code: {nextStationCode} • Approaching
          </p>
        </div>

        {/* 4. Destination */}
        <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded">
              4. Final Destination
            </span>
            <Flag className="w-4 h-4 text-indigo-700" />
          </div>
          <p className="text-base font-extrabold text-slate-900">
            {destinationStop?.station_name || 'Terminus'}
          </p>
          <p className="text-xs font-mono font-semibold text-indigo-800 mt-0.5">
            Predicted ETA: {destinationStop?.predicted_eta} ({destinationStop?.confidence}% Conf)
          </p>
        </div>
      </div>

      {/* Detailed Stop-by-Stop Horizontal Scrollable Track Timeline */}
      <div className="pt-2 overflow-x-auto pb-2">
        <div className="min-w-[760px] flex items-start justify-between gap-2 relative pt-4">
          {/* Connecting track line */}
          <div className="absolute top-8 left-6 right-6 h-1 bg-slate-200 rounded-full z-0" />

          {stops.map((stop) => {
            const isDeparted = stop.status === 'Departed';
            const isApproaching = stop.status === 'Approaching' || stop.status === 'Current';

            return (
              <div
                key={stop.station_code}
                className="relative z-10 flex flex-col items-center text-center flex-1 px-1"
              >
                {/* Node Circle */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-mono text-xs font-bold border-2 transition-all shadow-sm ${
                    isDeparted
                      ? 'bg-emerald-600 border-emerald-200 text-white'
                      : isApproaching
                      ? 'bg-amber-500 border-amber-200 text-slate-950 scale-110 ring-4 ring-amber-400/30'
                      : 'bg-white border-slate-300 text-slate-600'
                  }`}
                >
                  {isDeparted ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isApproaching ? (
                    <TrainFront className="w-4 h-4" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5" />
                  )}
                </div>

                {/* Station Code & Name */}
                <div className="mt-2.5">
                  <span
                    className={`font-mono text-xs font-extrabold px-2 py-0.5 rounded ${
                      isApproaching
                        ? 'bg-amber-100 text-amber-900'
                        : isDeparted
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {stop.station_code}
                  </span>
                  <p className="text-xs font-bold text-slate-800 mt-1 max-w-[100px] truncate">
                    {stop.station_name}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                    ETA: <strong className="text-slate-900">{stop.predicted_eta}</strong>
                  </p>
                  <p
                    className={`text-[10px] font-mono font-bold ${
                      stop.delay_mins <= 5 ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {stop.delay_mins <= 0 ? 'On Time' : `+${stop.delay_mins}m`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
