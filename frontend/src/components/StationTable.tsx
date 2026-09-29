import React from 'react';
import { CheckCircle2, Clock, Cpu, MapPin, Navigation, Sparkles } from 'lucide-react';
import { StationStop } from '../types/railway';
import { StatusBadge } from './StatusBadge';

interface StationTableProps {
  stops: StationStop[];
  selectedStationCode?: string;
  onSelectStation?: (stationCode: string) => void;
}

export const StationTable: React.FC<StationTableProps> = ({
  stops,
  selectedStationCode,
  onSelectStation,
}) => {
  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-rail-card overflow-hidden">
      {/* Table Header Bar */}
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 text-xs font-bold border border-blue-200/60">
              <Sparkles className="w-3 h-3" />
              Station-by-Station ML Schedule
            </span>
          </div>
          <h3 className="text-lg font-extrabold text-slate-900 mt-1">
            Upcoming & En-Route Stations Schedule
          </h3>
        </div>
        <p className="text-xs text-slate-500">
          Click any station row to inspect its dynamic prediction interval & confidence
        </p>
      </div>

      {/* Responsive Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              <th className="py-3.5 px-6">Station</th>
              <th className="py-3.5 px-4">Scheduled</th>
              <th className="py-3.5 px-4">Predicted ETA</th>
              <th className="py-3.5 px-4">Delay</th>
              <th className="py-3.5 px-4">Confidence</th>
              <th className="py-3.5 px-6 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {stops.map((stop) => {
              const isSelected = selectedStationCode === stop.station_code;
              const isApproaching = stop.status === 'Approaching';
              const isDeparted = stop.status === 'Departed';

              return (
                <tr
                  key={stop.station_code}
                  onClick={() => onSelectStation && onSelectStation(stop.station_code)}
                  className={`transition-colors ${
                    onSelectStation ? 'cursor-pointer' : ''
                  } ${
                    isSelected
                      ? 'bg-blue-50/90'
                      : isApproaching
                      ? 'bg-amber-50/50 hover:bg-amber-50/80'
                      : 'hover:bg-slate-50/90'
                  }`}
                >
                  {/* Station */}
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                          isDeparted
                            ? 'bg-emerald-100 text-emerald-800'
                            : isApproaching
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'bg-blue-900 text-white'
                        }`}
                      >
                        {stop.sequence}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{stop.station_name}</span>
                          <span className="font-mono text-xs font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60">
                            {stop.station_code}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>Platform {stop.platform}</span>
                          <span>•</span>
                          <span className="font-mono">{stop.distance_km} km</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Scheduled */}
                  <td className="py-4 px-4 font-mono text-sm text-slate-600 font-semibold">
                    <div>Arr: {stop.scheduled_arrival}</div>
                    <div className="text-xs text-slate-400">Dep: {stop.scheduled_departure}</div>
                  </td>

                  {/* Predicted ETA (Prominent) */}
                  <td className="py-4 px-4">
                    <div className="inline-flex flex-col px-3 py-1.5 rounded-xl bg-blue-950 text-white shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-mono text-base font-extrabold text-amber-300">
                          {stop.predicted_eta}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-blue-200">
                        Range: {stop.prediction_range}
                      </span>
                    </div>
                  </td>

                  {/* Delay */}
                  <td className="py-4 px-4 font-mono">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
                        stop.delay_mins <= 0
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : stop.delay_mins <= 15
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {stop.delay_mins <= 0 ? 'On Time (0m)' : `+${stop.delay_mins} min`}
                    </span>
                  </td>

                  {/* Confidence */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="font-mono text-xs font-extrabold text-slate-800">
                        {stop.confidence}%
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-4 px-6 text-right">
                    {isDeparted ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Departed
                      </span>
                    ) : isApproaching ? (
                      <StatusBadge
                        status="Approaching Next"
                        delayMins={stop.delay_mins}
                        size="sm"
                        pulse
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200/70 text-xs font-semibold">
                        <Navigation className="w-3 h-3 text-blue-700" />
                        Upcoming
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
