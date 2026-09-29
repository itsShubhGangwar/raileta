import React from 'react';
import { Clock, Cpu, MapPin, ShieldCheck, TrendingDown } from 'lucide-react';
import { StationStop } from '../types/railway';

interface ETACardProps {
  stationName: string;
  stationCode: string;
  scheduledArrival: string;
  predictedEta: string;
  predictionRange: string;
  confidence: number;
  delayMins: number;
  upcomingStops?: StationStop[];
  selectedStationCode?: string;
  onSelectStation?: (code: string) => void;
}

export const ETACard: React.FC<ETACardProps> = ({
  stationName,
  stationCode,
  scheduledArrival,
  predictedEta,
  predictionRange,
  confidence,
  delayMins,
  upcomingStops = [],
  selectedStationCode,
  onSelectStation,
}) => {
  return (
    <div className="bg-[#0F1F3D] text-white rounded-2xl p-6 sm:p-7 shadow-md border border-slate-800">
      {/* Top Header & Target Station Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-700/80">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-900 border border-blue-700 text-amber-300 text-xs font-bold uppercase tracking-wider">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            EXPECTED ARRIVAL
          </span>
          <span className="text-xs text-slate-300 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
            <strong className="text-white">{stationName}</strong> ({stationCode}) • Sched:{' '}
            <span className="font-mono">{scheduledArrival}</span>
          </span>
        </div>

        {upcomingStops.length > 0 && onSelectStation && (
          <select
            value={selectedStationCode || stationCode}
            onChange={(e) => onSelectStation(e.target.value)}
            aria-label="Select Target Station"
            className="bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {upcomingStops.map((s) => (
              <option key={s.station_code} value={s.station_code}>
                Target Stop: {s.station_name} ({s.station_code})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Main Expected Arrival Time & Expected Range */}
      <div className="mt-5 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-4xl sm:text-5xl font-extrabold font-mono tracking-tight text-white">
            {predictedEta}
          </p>
          <p className="text-sm font-mono font-semibold text-amber-300 mt-1.5 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>{predictionRange} expected range</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono border ${
              delayMins <= 5
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
            }`}
          >
            {delayMins <= 0 ? 'On Time (0m)' : `+${delayMins} min net delay`}
          </span>

          <span className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold font-mono text-emerald-300 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Confidence: {confidence}%
          </span>
        </div>
      </div>

      {/* Bottom Insight Bar */}
      <div className="mt-5 pt-4 border-t border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
          Section slack recovery & historical running pattern factored into arrival window
        </span>
        <span className="font-mono text-[11px] text-slate-400">
          HistGradientBoosting Quantile P10–P90
        </span>
      </div>
    </div>
  );
};
