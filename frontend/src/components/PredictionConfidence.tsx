import React from 'react';
import { CheckCircle2, CloudSun, Cpu, Gauge, Radio, ShieldCheck } from 'lucide-react';

interface PredictionConfidenceProps {
  confidence: number;
  predictionRange?: string;
  congestionLevel?: string;
  weatherCondition?: string;
  historicalAvgDelayMins?: number;
}

export const PredictionConfidence: React.FC<PredictionConfidenceProps> = ({
  confidence,
  predictionRange,
  congestionLevel = 'Moderate',
  weatherCondition = 'Clear Sky',
  historicalAvgDelayMins = 11,
}) => {
  const tier =
    confidence >= 88
      ? { label: 'Very High Reliability', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
      : confidence >= 78
      ? { label: 'High Confidence', color: 'text-blue-800 bg-blue-50 border-blue-200' }
      : { label: 'Moderate Confidence', color: 'text-amber-800 bg-amber-50 border-amber-200' };

  const barGradient =
    confidence >= 88
      ? 'from-emerald-600 to-teal-500'
      : confidence >= 78
      ? 'from-blue-800 via-indigo-600 to-amber-500'
      : 'from-amber-500 to-orange-500';

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-rail-card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Prediction Confidence</h3>
            <p className="text-xs text-slate-500">Quantile Ensemble Calibration Score</p>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${tier.color}`}>
          {tier.label}
        </span>
      </div>

      {/* Main Percentage & Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-extrabold font-mono text-slate-900">{confidence}%</span>
          <span className="text-xs text-slate-500 font-medium">
            {predictionRange ? `Expected Range: ${predictionRange}` : 'P10–P90 expected arrival window'}
          </span>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-500`}
            style={{ width: `${Math.min(100, Math.max(20, confidence))}%` }}
          />
        </div>
      </div>

      {/* Feature Signals Contributing to Confidence */}
      <div className="grid grid-cols-2 gap-2.5 pt-2">
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-start gap-2">
          <Radio className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-slate-700">GPS Block Sync</p>
            <p className="text-[11px] text-slate-500">Live 3s Telemetry</p>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-start gap-2">
          <CloudSun className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-slate-700">Weather Impact</p>
            <p className="text-[11px] text-slate-500 truncate">{weatherCondition}</p>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-start gap-2">
          <Gauge className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-slate-700">Corridor Traffic</p>
            <p className="text-[11px] text-slate-500 truncate">{congestionLevel}</p>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-start gap-2">
          <Cpu className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-slate-700">30-Day Baseline</p>
            <p className="text-[11px] text-slate-500">Avg +{historicalAvgDelayMins}m delay</p>
          </div>
        </div>
      </div>

      <div className="pt-1 flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>Calibrated against 8,000+ historical Indian Railways section runs</span>
      </div>
    </div>
  );
};
