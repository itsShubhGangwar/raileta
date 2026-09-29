import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Clock,
  Compass,
  Database,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AnalyticsCard } from '../components/AnalyticsCard';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { getAnalyticsData } from '../services/api';
import { AnalyticsData } from '../types/railway';

export const AnalyticsPage: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAnalyticsData();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <LoadingState />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <ErrorState message={error || 'Analytics unavailable'} onRetry={loadAnalytics} />
      </div>
    );
  }

  const isEmptyDb = data.kpis.active_trains_monitored === 0;

  const avgDelayMins =
    data.average_delay_by_hour && data.average_delay_by_hour.length > 0
      ? Number(
          (
            data.average_delay_by_hour.reduce((acc, h) => acc + h.avg_delay, 0) /
            data.average_delay_by_hour.length
          ).toFixed(1)
        )
      : 0;

  const totalAnalyzedRecords =
    data.delay_distribution && data.delay_distribution.length > 0
      ? data.delay_distribution.reduce((acc, d) => acc + d.trains, 0)
      : data.kpis.active_trains_monitored;

  return (
    <div className="min-h-screen pb-16">
      {/* Small Railway Image Header Banner (Section 9) */}
      <div className="relative overflow-hidden bg-[#0B1F3A] text-white py-10 sm:py-14 border-b border-blue-900/50">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/railway/tracks-atmosphere.jpg"
            alt="Electrified railway tracks and express train"
            loading="eager"
            className="w-full h-full object-cover object-center opacity-45"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/92 via-[#0F1F3D]/82 to-[#0B1F3A]/55" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/25 text-white text-xs font-bold mb-3 uppercase tracking-wider">
            <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
            UPLOADED DATASET • OPERATIONAL INTELLIGENCE
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight drop-shadow-sm">
            RailETA Analytics
          </h1>
          <p className="text-blue-100 text-sm sm:text-base max-w-2xl mt-2 leading-relaxed">
            Understand delay patterns and ETA prediction behavior.
          </p>

          {/* 4 Required KPI Summary Cards (Section 18) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs text-blue-200 font-bold uppercase tracking-wider">
                <span>Prediction Accuracy</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-3xl font-extrabold font-mono text-emerald-300 mt-1.5">
                {isEmptyDb ? '—' : `${data.kpis.prediction_accuracy_pct}%`}
              </p>
              <p className="text-xs text-blue-200 mt-1">
                Within ±5 minutes of actual arrival
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs text-blue-200 font-bold uppercase tracking-wider">
                <span>Average Delay</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-3xl font-extrabold font-mono text-white mt-1.5">
                {isEmptyDb ? '—' : `${avgDelayMins} mins`}
              </p>
              <p className="text-xs text-blue-200 mt-1">
                Mean corridor delay across monitored runs
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs text-blue-200 font-bold uppercase tracking-wider">
                <span>Average ETA Error</span>
                <Target className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-3xl font-extrabold font-mono text-amber-300 mt-1.5">
                {isEmptyDb ? '—' : `${data.kpis.network_mae_mins} mins`}
              </p>
              <p className="text-xs text-blue-200 mt-1">
                Mean Absolute Error (MAE) on test split
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs text-blue-200 font-bold uppercase tracking-wider">
                <span>Records Analyzed</span>
                <Activity className="w-4 h-4 text-blue-300" />
              </div>
              <p className="text-3xl font-extrabold font-mono text-white mt-1.5">
                {isEmptyDb ? '0' : totalAnalyzedRecords.toLocaleString()}
              </p>
              <p className="text-xs text-blue-200 mt-1">
                Active trains: {data.kpis.active_trains_monitored.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {isEmptyDb ? (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
          <div className="bg-white rounded-3xl p-10 sm:p-12 border border-slate-200 shadow-rail-card text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center mx-auto">
              <Database className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-slate-900">
                Upload railway and historical datasets to view analytics.
              </h2>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Populate stations, trains, routes, and historical runs in the RailETA Data Center to
                unlock delay distributions, scheduled vs actual curves, and ML error benchmarks.
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/data"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-extrabold shadow-md transition-colors"
              >
                <Database className="w-4 h-4" />
                OPEN DATA CENTER
              </Link>
            </div>
          </div>
        </div>
      ) : (
        /* 6 Recharts Visualizations */
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. Scheduled vs Actual Arrival */}
          <AnalyticsCard
            title="Scheduled vs Actual Arrival"
            subtitle="Cumulative journey elapsed minutes across monitored corridor stations"
            badge="Corridor Tracking"
            icon={Clock}
            footerInsight="RailETA predicted arrival closely tracks actual ground-truth arrival within ±2 mins."
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.scheduled_vs_actual}
                margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="station" tick={{ fontSize: 12, fontWeight: 700 }} />
                <YAxis unit="m" tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="scheduled_mins"
                  name="Scheduled Elapsed (min)"
                  stroke="#94A3B8"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
                <Line
                  type="monotone"
                  dataKey="actual_mins"
                  name="Actual Arrival (min)"
                  stroke="#1D4ED8"
                  strokeWidth={3}
                />
                <Line
                  type="monotone"
                  dataKey="predicted_mins"
                  name="RailETA Predicted (min)"
                  stroke="#D97706"
                  strokeWidth={2.5}
                />
              </LineChart>
            </ResponsiveContainer>
          </AnalyticsCard>

          {/* 2. Delay Distribution */}
          <AnalyticsCard
            title="Delay Distribution"
            subtitle="Distribution of monitored trains by delay severity bucket"
            badge={`${data.kpis.active_trains_monitored} Trains`}
            icon={BarChart3}
            footerInsight="Identifies the proportion of runs operating on-time vs moderate or severe delay."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.delay_distribution}
                margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fontWeight: 600 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="trains"
                  name="Number of Trains"
                  fill="#1D4ED8"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </AnalyticsCard>

          {/* 3. ETA Prediction Error */}
          <AnalyticsCard
            title="ETA Prediction Error (MAE by Distance Horizon)"
            subtitle="Mean Absolute Error (minutes): RailETA GBDT Model vs Static Delay Addition"
            badge="ML Benchmark"
            icon={Target}
            footerInsight="At longer distance horizons, RailETA significantly reduces arrival prediction error."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.prediction_error_by_horizon}
                margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="horizon" tick={{ fontSize: 12, fontWeight: 700 }} />
                <YAxis unit="m" tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="raileta_mae"
                  name="RailETA GBDT MAE (min)"
                  fill="#16A34A"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="legacy_ntes_mae"
                  name="Static Delay Baseline MAE (min)"
                  fill="#DC2626"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </AnalyticsCard>

          {/* 4. Average Delay by Hour */}
          <AnalyticsCard
            title="Average Delay by Hour"
            subtitle="24-hour diurnal network delay (mins) & outer-junction congestion index (%)"
            badge="Diurnal Profile"
            icon={Activity}
            footerInsight="Captures morning and evening terminal congestion peaks."
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.average_delay_by_hour}
                margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="hourDelayGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1D4ED8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#1D4ED8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="hour" tick={{ fontSize: 12, fontWeight: 600 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="avg_delay"
                  name="Avg Delay (min)"
                  stroke="#1D4ED8"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#hourDelayGrad)"
                />
                <Line
                  type="monotone"
                  dataKey="congestion"
                  name="Junction Congestion (%)"
                  stroke="#D97706"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </AnalyticsCard>

          {/* 5. Route Performance */}
          <AnalyticsCard
            title="Route Performance Across Corridors"
            subtitle="On-time punctuality (%) vs RailETA ML forecast accuracy (%) by corridor"
            badge="Corridor Analysis"
            icon={Compass}
            footerInsight="Compares baseline schedule adherence against ML ETA forecast accuracy."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.route_performance}
                margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="corridor" tick={{ fontSize: 10, fontWeight: 700 }} />
                <YAxis domain={[60, 100]} unit="%" tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="punctuality"
                  name="Corridor Punctuality (%)"
                  fill="#60A5FA"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="ml_accuracy"
                  name="RailETA Forecast Accuracy (%)"
                  fill="#1D4ED8"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </AnalyticsCard>

          {/* 6. Prediction Accuracy Calibration Trend */}
          <AnalyticsCard
            title="Prediction Accuracy Calibration Trend"
            subtitle="Longitudinal accuracy within ±5 minutes and ±10 minutes of actual arrival"
            badge={`${data.kpis.prediction_accuracy_pct}% ±5m`}
            icon={TrendingUp}
            footerInsight="Tracks quantile interval calibration across historical evaluation windows."
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.prediction_accuracy_trend}
                margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fontWeight: 700 }} />
                <YAxis domain={[80, 100]} unit="%" tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="within_5m"
                  name="Accuracy Within ±5 Mins (%)"
                  stroke="#16A34A"
                  strokeWidth={3}
                />
                <Line
                  type="monotone"
                  dataKey="within_10m"
                  name="Accuracy Within ±10 Mins (%)"
                  stroke="#1D4ED8"
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          </AnalyticsCard>
        </div>
      )}
    </div>
  );
};
