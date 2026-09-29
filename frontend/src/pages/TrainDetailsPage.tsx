import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Clock,
  CloudRain,
  Compass,
  Cpu,
  Database,
  Eye,
  Gauge,
  History,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Thermometer,
  TrendingDown,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StatusBadge } from '../components/StatusBadge';
import { TrainTimeline } from '../components/TrainTimeline';
import { AnalyticsCard } from '../components/AnalyticsCard';
import { LoadingState } from '../components/LoadingState';
import { getTrainDetails, searchTrains } from '../services/api';
import { TrainStatus, TrainSummary } from '../types/railway';

export const TrainDetailsPage: React.FC = () => {
  const { trainNumber } = useParams<{ trainNumber?: string }>();
  const navigate = useNavigate();

  const [train, setTrain] = useState<TrainStatus | null>(null);
  const [availableTrains, setAvailableTrains] = useState<TrainSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetails = async (requestedNum?: string) => {
    setLoading(true);
    setError(null);
    try {
      const allTrains = await searchTrains({}).catch(() => [] as TrainSummary[]);
      setAvailableTrains(allTrains);

      const routedTrain = allTrains.find((t) => t.has_routes || (t.route_count ?? 0) > 0);
      const defaultTrainNo = (routedTrain || allTrains[0])?.train_number || '';
      const targetNum = (requestedNum || '').trim() || defaultTrainNo;

      if (!targetNum) {
        setTrain(null);
        setError(
          'No train data available in the current dataset. Upload stations.csv, trains.csv, and routes.csv in the Data Center.'
        );
        return;
      }

      let data: TrainStatus;
      try {
        data = await getTrainDetails(targetNum);
      } catch (fetchErr) {
        if (defaultTrainNo && defaultTrainNo.toUpperCase() !== targetNum.toUpperCase()) {
          data = await getTrainDetails(defaultTrainNo);
          navigate(`/details/${data.train_number}`, { replace: true });
        } else {
          throw fetchErr;
        }
      }

      if (
        (!data.stops || data.stops.length === 0) &&
        routedTrain &&
        routedTrain.train_number.toUpperCase() !== data.train_number.toUpperCase()
      ) {
        data = await getTrainDetails(routedTrain.train_number);
        navigate(`/details/${data.train_number}`, { replace: true });
      } else if (!requestedNum && data.train_number) {
        navigate(`/details/${data.train_number}`, { replace: true });
      }

      setTrain(data);
    } catch (err) {
      setTrain(null);
      setError(err instanceof Error ? err.message : 'Unable to load train details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails(trainNumber);
  }, [trainNumber]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <LoadingState />
      </div>
    );
  }

  if (error || !train) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white rounded-3xl p-10 sm:p-12 border border-slate-200 shadow-rail-card text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 flex items-center justify-center mx-auto">
            <Database className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-slate-900">
              {trainNumber
                ? `Train ${trainNumber} is not available in the current dataset.`
                : 'No train data available in the current dataset.'}
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Upload train and route data from Data Center.
            </p>
          </div>
          {availableTrains.length > 0 && (
            <div className="pt-2 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Available Uploaded Trains:
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {availableTrains.map((t) => (
                  <button
                    key={t.train_number}
                    onClick={() => navigate(`/details/${t.train_number}`)}
                    className="px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-extrabold border border-blue-200 transition-colors"
                  >
                    {t.train_number} — {t.train_name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to="/data"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-extrabold shadow-md transition-colors"
            >
              <Database className="w-4 h-4" />
              OPEN DATA CENTER
            </Link>
            <button
              type="button"
              onClick={() => loadDetails(trainNumber)}
              className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Build Recharts datasets from train.stops
  const propagationData = train.stops.map((s) => ({
    station: s.station_code,
    name: s.station_name,
    currentDelay: s.delay_mins,
    historicalAvg: s.historical_avg_delay_mins,
    distanceKm: s.distance_km,
  }));

  const sectionRunningData = train.stops.slice(1).map((s, idx) => ({
    section: `${train.stops[idx].station_code}→${s.station_code}`,
    scheduledMins: s.section_scheduled_mins,
    predictedMins: s.section_predicted_mins,
  }));

  const totalScheduledRunMins = train.stops
    .slice(1)
    .reduce((acc, s) => acc + (s.section_scheduled_mins || 0), 0);
  const totalPredictedRunMins = train.stops
    .slice(1)
    .reduce((acc, s) => acc + (s.section_predicted_mins || 0), 0);
  const slackRecoveryMins = Math.max(0, totalScheduledRunMins - totalPredictedRunMins);

  return (
    <div className="min-h-screen pb-16">
      {/* Top Sub-Navigation & Train Switcher */}
      <div className="bg-white border-b border-slate-200 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to={`/status/${train.train_number}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Live Status
            </Link>
            <span className="text-xs text-slate-400 hidden sm:inline">|</span>
            <span className="text-xs font-bold text-slate-500 hidden sm:inline">
              Select Train:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {availableTrains.map((t) => (
                <button
                  key={t.train_number}
                  onClick={() => navigate(`/details/${t.train_number}`)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold transition-colors ${
                    t.train_number === train.train_number
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-blue-50'
                  }`}
                >
                  {t.train_number}
                </button>
              ))}
            </div>
          </div>

          <span className="text-xs font-mono text-slate-500">
            Data Source: <strong>{train.data_source || 'UPLOADED DATASET'}</strong>
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Top Hero: Train Identity, Route, Status (Section 16) */}
        <div className="relative overflow-hidden bg-[#0B1F3A] text-white rounded-3xl p-6 sm:p-8 shadow-rail-float border border-blue-800/50">
          <div className="absolute inset-0 z-0">
            <img
              src="/images/railway/corridor-train.jpg"
              alt="Express passenger train on Indian railway corridor"
              loading="eager"
              className="w-full h-full object-cover object-center opacity-45"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/92 via-[#0F1F3D]/80 to-[#0B1F3A]/55" />
          </div>

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="px-3 py-1 rounded-xl bg-amber-400 text-slate-950 font-mono text-sm font-extrabold">
                  {train.train_number}
                </span>
                <span className="px-3 py-1 rounded-xl bg-white/15 border border-white/20 text-xs font-bold text-white uppercase tracking-wider">
                  Deep Journey Intelligence
                </span>
                <StatusBadge
                  status={train.running_status}
                  delayMins={train.current_delay_mins}
                  pulse
                />
              </div>

              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                {train.train_number} • {train.train_name}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-blue-100">
                <span>
                  <strong className="text-white">{train.source_name} ({train.source_code})</strong>{' '}
                  →{' '}
                  <strong className="text-white">
                    {train.destination_name} ({train.destination_code})
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Distance: <strong className="font-mono text-white">{train.total_distance_km} km</strong>
                </span>
                <span>•</span>
                <span>
                  Halts: <strong className="font-mono text-white">{train.stops.length} Stations</strong>
                </span>
              </div>
            </div>

            {/* Prediction Confidence Snapshot in Hero */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 sm:p-5 min-w-[260px] space-y-2">
              <div className="flex items-center justify-between text-xs text-blue-200 font-bold uppercase tracking-wider">
                <span>Prediction Confidence</span>
                <ShieldCheck className="w-4 h-4 text-emerald-300" />
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <span className="text-[11px] text-blue-200 block">Expected Arrival</span>
                  <span className="font-mono text-2xl font-extrabold text-amber-300">
                    {train.predicted_eta}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-blue-200 block">Confidence</span>
                  <span className="font-mono text-2xl font-extrabold text-emerald-300">
                    {train.prediction_confidence}%
                  </span>
                </div>
              </div>
              <p className="text-xs font-mono text-blue-100">
                Expected Range: {train.prediction_range} ({train.next_station_code})
              </p>
            </div>
          </div>
        </div>

        {/* 4 Key Operational Cards: Live Telemetry, Weather / Congestion, Slack Recovery, Historical Running Time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* 1. Live Telemetry */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-rail-card space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Live Telemetry
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <Gauge className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-extrabold font-mono text-slate-900">
              {train.current_speed_kmph}{' '}
              <span className="text-sm font-sans text-slate-500">km/h</span>
            </p>
            <p className="text-xs font-mono text-slate-600">
              Coords: {train.current_lat.toFixed(3)}, {train.current_lng.toFixed(3)}
            </p>
            <p className="text-xs text-slate-500">
              Delay:{' '}
              <strong className="font-mono text-slate-800">
                {train.current_delay_mins <= 0 ? 'On Time (0m)' : `+${train.current_delay_mins} min`}
              </strong>
            </p>
          </div>

          {/* 2. Weather / Congestion */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-rail-card space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Weather / Congestion
              </span>
              <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
                <CloudRain className="w-5 h-5" />
              </div>
            </div>
            <p className="text-lg font-extrabold text-slate-900 truncate">
              {train.weather_condition} • {train.congestion_level}
            </p>
            <div className="flex items-center gap-3 text-xs text-slate-600 pt-0.5">
              <span className="inline-flex items-center gap-1 font-mono font-bold">
                <Thermometer className="w-3.5 h-3.5 text-amber-500" />
                {train.weather_temp_c}°C
              </span>
              <span className="inline-flex items-center gap-1 font-mono font-bold">
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                {train.weather_visibility_km} km
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Congestion Index:{' '}
              <strong className="font-mono text-slate-800">
                {(train.congestion_index * 100).toFixed(0)}%
              </strong>
            </p>
          </div>

          {/* 3. Slack Recovery */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-rail-card space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Slack Recovery
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-extrabold font-mono text-slate-900">
              {slackRecoveryMins} <span className="text-sm font-sans text-slate-500">mins</span>
            </p>
            <p className="text-xs text-slate-500">
              Scheduled Run: <strong className="font-mono">{totalScheduledRunMins}m</strong> vs ML:{' '}
              <strong className="font-mono">{totalPredictedRunMins}m</strong>
            </p>
            <p className="text-xs text-emerald-700 font-semibold">
              Corridor buffer recovery potential
            </p>
          </div>

          {/* 4. Historical Running Time & Delay Baseline */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-rail-card space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Historical Running Time
              </span>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <History className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-extrabold font-mono text-slate-900">
              +{train.historical_avg_delay_mins}{' '}
              <span className="text-sm font-sans text-slate-500">mins avg</span>
            </p>
            <p className="text-xs text-slate-500">
              Historical baseline across {train.stops.length} stops
            </p>
            <p className="text-xs text-indigo-700 font-semibold">
              {train.current_delay_mins <= train.historical_avg_delay_mins
                ? 'Running faster than historical mean'
                : `+${(train.current_delay_mins - train.historical_avg_delay_mins).toFixed(0)}m above baseline`}
            </p>
          </div>
        </div>

        {/* Two Analytical Charts: Delay Propagation & Slack Recovery + Historical Running Time Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AnalyticsCard
            title="Delay Propagation & Slack Recovery"
            subtitle="Predicted station delay vs historical station average (minutes)"
            badge="Delay Propagation"
            icon={TrendingDown}
            footerInsight="Shows how initial delay propagates or recovers across consecutive corridor stations."
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={propagationData}
                margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="delayGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1D4ED8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#1D4ED8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="station" tick={{ fontSize: 12, fontWeight: 700 }} />
                <YAxis unit="m" tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="currentDelay"
                  name="Predicted Run Delay (min)"
                  stroke="#1D4ED8"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#delayGrad)"
                />
                <Line
                  type="monotone"
                  dataKey="historicalAvg"
                  name="Historical Avg Delay (min)"
                  stroke="#D97706"
                  strokeWidth={2.5}
                  strokeDasharray="5 5"
                />
              </AreaChart>
            </ResponsiveContainer>
          </AnalyticsCard>

          <AnalyticsCard
            title="Historical & Scheduled Running Time"
            subtitle="Scheduled inter-station block time vs ML predicted running time (minutes)"
            badge="Running Time"
            icon={Clock}
            footerInsight="Sections where predicted running time is below scheduled time indicate slack recovery."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sectionRunningData}
                margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="section" tick={{ fontSize: 11, fontWeight: 700 }} />
                <YAxis unit="m" tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="scheduledMins"
                  name="Scheduled Block Time (min)"
                  fill="#94A3B8"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="predictedMins"
                  name="ML Predicted Block Time (min)"
                  fill="#1D4ED8"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </AnalyticsCard>
        </div>

        {/* Feature Importance & Prediction Confidence Breakdown (Section 16) */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-rail-card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Feature Importance & Prediction Confidence
                </h3>
                <p className="text-xs text-slate-500">
                  Operational factors contributing to the current ML ETA forecast ({train.predicted_eta},{' '}
                  {train.prediction_confidence}% confidence)
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-xs font-bold">
              <Activity className="w-3.5 h-3.5 text-blue-700" />
              Expected Range: {train.prediction_range}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                factor: 'Current Delay',
                weight_pct: 36,
                description: `Reported delay: ${train.current_delay_mins} min`,
                impact_mins: train.current_delay_mins,
              },
              {
                factor: 'Remaining Distance',
                weight_pct: 22,
                description: `${train.distance_remaining_km} km to destination`,
                impact_mins: -slackRecoveryMins,
              },
              {
                factor: 'Historical Running Time',
                weight_pct: 16,
                description: `30-day corridor mean: +${train.historical_avg_delay_mins}m`,
                impact_mins: train.historical_avg_delay_mins,
              },
              {
                factor: 'Route Congestion',
                weight_pct: 12,
                description: `Level: ${train.congestion_level} (${Math.round(train.congestion_index * 100)}%)`,
                impact_mins: Math.round(train.congestion_index * 10),
              },
              {
                factor: 'Current Speed',
                weight_pct: 8,
                description: `${train.current_speed_kmph} km/h (MPS ${train.max_permissible_speed_kmph} km/h)`,
                impact_mins: 0,
              },
              {
                factor: 'Weather Conditions',
                weight_pct: 6,
                description: `${train.weather_condition} • Vis ${train.weather_visibility_km} km`,
                impact_mins: 0,
              },
            ].map((f) => (
              <div
                key={f.factor}
                className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-900">{f.factor}</span>
                  <span className="font-mono text-xs font-extrabold text-blue-700">
                    {f.weight_pct}% weight
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-700 rounded-full"
                    style={{ width: `${Math.min(100, f.weight_pct * 2.2)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="truncate">{f.description}</span>
                  <span className="font-mono font-bold text-slate-800 shrink-0 ml-2">
                    {f.impact_mins >= 0 ? `+${f.impact_mins}m` : `${f.impact_mins}m`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Route Timeline */}
        <TrainTimeline
          stops={train.stops}
          previousStationName={train.previous_station_name}
          previousStationCode={train.previous_station_code}
          nextStationName={train.next_station_name}
          nextStationCode={train.next_station_code}
          currentSpeedKmph={train.current_speed_kmph}
          currentDelayMins={train.current_delay_mins}
          distanceCoveredKm={train.distance_covered_km}
          totalDistanceKm={train.total_distance_km}
        />

        {/* Scheduled vs Predicted Arrival Detailed Breakdown Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-rail-card overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">
                Complete Route: Scheduled vs Predicted Arrival & Section Metrics
              </h3>
              <p className="text-xs text-slate-500">
                Detailed halt-by-halt breakdown of distance, block duration, historical baseline, and
                ML confidence
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-blue-700" />
              {train.stops.length} Corridor Halts
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-5">#</th>
                  <th className="py-3.5 px-5">Station (Code)</th>
                  <th className="py-3.5 px-4">Distance</th>
                  <th className="py-3.5 px-4">Scheduled Arr / Dep</th>
                  <th className="py-3.5 px-4">Predicted ETA (Range)</th>
                  <th className="py-3.5 px-4">Section Run (Sched vs ML)</th>
                  <th className="py-3.5 px-4">Historical Avg</th>
                  <th className="py-3.5 px-5 text-right">Net Delay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {train.stops.map((s) => (
                  <tr key={s.station_code} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-5 font-mono text-xs font-bold text-slate-500">
                      0{s.sequence}
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="font-bold text-slate-900">
                        {s.station_name}{' '}
                        <span className="font-mono text-xs text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded">
                          {s.station_code}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Platform {s.platform} • {s.status}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-700">
                      {s.distance_km} km
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                      <div>Arr: {s.scheduled_arrival}</div>
                      <div>Dep: {s.scheduled_departure}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-sm font-extrabold text-blue-700">
                        {s.predicted_eta}
                      </span>
                      <span className="block font-mono text-[11px] text-slate-500">
                        {s.prediction_range} ({s.confidence}%)
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs">
                      {s.sequence === 1 ? (
                        <span className="text-slate-400">Origin</span>
                      ) : (
                        <div>
                          <span className="text-slate-600">{s.section_scheduled_mins}m</span> →{' '}
                          <strong
                            className={
                              s.section_predicted_mins <= s.section_scheduled_mins
                                ? 'text-emerald-600'
                                : 'text-amber-600'
                            }
                          >
                            {s.section_predicted_mins}m
                          </strong>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                      +{s.historical_avg_delay_mins}m
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono text-xs font-bold">
                      <span
                        className={`px-2.5 py-1 rounded-lg ${
                          s.delay_mins <= 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : s.delay_mins <= 15
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {s.delay_mins <= 0 ? 'On Time' : `+${s.delay_mins}m`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
