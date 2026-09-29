import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Clock,
  CloudRain,
  Compass,
  Cpu,
  Database,
  Gauge,
  History,
  MapPin,
  Radio,
  Route,
  Search,
  ShieldCheck,
  Sliders,
  TrainFront,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Hero } from '../components/Hero';
import { TrainSearchCard } from '../components/TrainSearchCard';
import { ServiceCard } from '../components/ServiceCard';
import { TrainCard } from '../components/TrainCard';
import { LiveMap } from '../components/LiveMap';
import { getAnalyticsData, getTrainStatus, searchTrains } from '../services/api';
import { AnalyticsData, TrainStatus, TrainSummary } from '../types/railway';

export const HomePage: React.FC = () => {
  const [trains, setTrains] = useState<TrainSummary[]>([]);
  const [primaryTrainStatus, setPrimaryTrainStatus] = useState<TrainStatus | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      searchTrains({}).catch(() => [] as TrainSummary[]),
      getAnalyticsData().catch(() => null),
    ])
      .then(async ([trainList, analyticsRes]) => {
        if (cancelled) return;
        setTrains(trainList);
        setAnalytics(analyticsRes);

        const routed =
          trainList.find((t) => t.has_routes || (t.route_count ?? 0) > 0) || trainList[0];
        if (routed) {
          try {
            const st = await getTrainStatus(routed.train_number);
            if (!cancelled) setPrimaryTrainStatus(st);
          } catch {
            if (!cancelled) setPrimaryTrainStatus(null);
          }
        } else {
          setPrimaryTrainStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const primaryTrain =
    trains.find((t) => t.has_routes || (t.route_count ?? 0) > 0) || trains[0];
  const statusLink = primaryTrain ? `/status/${primaryTrain.train_number}` : '/status';
  const detailsLink = primaryTrain ? `/details/${primaryTrain.train_number}` : '/details';

  const nextStop =
    primaryTrainStatus?.stops?.find((s) => s.status === 'Approaching') ||
    primaryTrainStatus?.stops?.find((s) => s.status === 'Upcoming') ||
    primaryTrainStatus?.stops?.[primaryTrainStatus.stops.length - 1];

  const services = [
    {
      title: 'Train Search',
      description: 'Find uploaded train services quickly.',
      icon: Search,
      badgeText: 'Service Directory',
      to: '/search',
    },
    {
      title: 'Live Train Status',
      description: 'Monitor current position, speed and delay.',
      icon: Activity,
      badgeText: 'Live Tracking',
      to: statusLink,
    },
    {
      title: 'AI ETA Prediction',
      description: 'Predict arrival using the RailETA ML pipeline.',
      icon: Cpu,
      badgeText: 'ML Pipeline',
      to: statusLink,
    },
    {
      title: 'Route Intelligence',
      description: 'Explore station-by-station route information.',
      icon: Route,
      badgeText: 'Corridor Stops',
      to: detailsLink,
    },
    {
      title: 'Telemetry Control',
      description: 'Test manual or uploaded train telemetry.',
      icon: Sliders,
      badgeText: 'Control Center',
      to: '/demo-control',
    },
    {
      title: 'Analytics',
      description: 'Understand delay patterns and prediction behavior.',
      icon: BarChart3,
      badgeText: 'Performance',
      to: '/analytics',
    },
  ];

  const howItWorksSteps = [
    {
      step: '01',
      title: 'DATA',
      description: 'Uploaded / manual / authorized external telemetry',
      icon: Database,
    },
    {
      step: '02',
      title: 'FEATURES',
      description: 'Speed, delay, route, weather, congestion',
      icon: Gauge,
    },
    {
      step: '03',
      title: 'ML PREDICTION',
      description: 'RailETA prediction model',
      icon: Cpu,
    },
    {
      step: '04',
      title: 'ETA',
      description: 'Predicted arrival + confidence range',
      icon: Clock,
    },
  ];

  const hasAnalyticsData = Boolean(
    analytics && analytics.kpis && analytics.kpis.active_trains_monitored > 0
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* 1. HOMEPAGE HERO */}
      <Hero
        featuredTrain={primaryTrain}
        totalTrains={trains.length}
        dataSourceLabel={primaryTrainStatus?.data_source || primaryTrain?.data_source}
      />

      {/* 2. FLOATING TRAIN SEARCH CARD */}
      <TrainSearchCard floating availableTrains={trains} />

      {/* HERO QUICK STATS */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 flex items-start gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F1F3D]">
                ML ETA Prediction
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                HistGradientBoosting arrival forecasting
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/90 p-4 flex items-start gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F1F3D]">
                Real-time Telemetry
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {trains.length > 0
                  ? `${trains.length} active train service${trains.length === 1 ? '' : 's'} tracked`
                  : 'WebSocket & manual telemetry stream'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/90 p-4 flex items-start gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F1F3D]">
                Route Intelligence
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {primaryTrainStatus?.stops?.length
                  ? `${primaryTrainStatus.stops.length} corridor stops mapped on active route`
                  : 'Station-by-station corridor geometry'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/90 p-4 flex items-start gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F1F3D]">
                Confidence Ranges
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                P10–P90 arrival window & reliability score
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 w-full">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
              Railway Portal Modules
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F1F3D] tracking-tight mt-1">
              Everything You Need for a Smarter Journey
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Track, predict and understand your train journey from one place.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {services.map((service) => (
            <ServiceCard key={service.title} {...service} />
          ))}
        </div>
      </section>

      {/* 3. LIVE TRAIN STATUS SECTION (With Wide Railway Image Background & White Cards) */}
      <section className="relative mt-16 sm:mt-20 py-16 sm:py-20 overflow-hidden bg-[#0B1F3A] w-full">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/railway/corridor-train.jpg"
            alt="Passenger express train travelling across Indian railway tracks and countryside"
            loading="lazy"
            className="w-full h-full object-cover object-center opacity-55"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/90 via-[#0F1F3D]/78 to-[#0B1F3A]/75" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                Active Services
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                Live Train Status
              </h2>
              <p className="text-sm text-blue-100 mt-1">
                Track trains using the latest available telemetry.
              </p>
            </div>
            {trains.length > 0 && (
              <Link
                to="/search"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-xs sm:text-sm font-bold text-white transition-colors"
              >
                <span>View All Trains</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 text-sm font-semibold text-slate-500 shadow-lg">
              Loading train telemetry from database...
            </div>
          ) : trains.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-lg space-y-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center mx-auto">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0F1F3D]">
                No railway data has been uploaded yet.
              </h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Upload your stations, trains, and routes datasets in the Data Center to view live
                train status cards.
              </p>
              <div>
                <Link
                  to="/data"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold shadow-sm transition-colors"
                >
                  <Database className="w-4 h-4" />
                  OPEN DATA CENTER
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {trains.slice(0, 4).map((train) => (
                <TrainCard key={train.train_number} train={train} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. AI ETA SECTION (LEFT: ETA Prediction Card & Context, RIGHT: Large Train Image) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 w-full">
        <div className="bg-gradient-to-br from-white via-blue-50/40 to-slate-50 rounded-3xl border border-slate-200 shadow-rail-card overflow-hidden p-6 sm:p-8 lg:p-10">
          {primaryTrainStatus ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* LEFT: ETA Prediction Card + Operational Context */}
              <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                <div>
                  <span className="text-xs font-bold uppercase tracking-widest text-blue-700">
                    Explainable Arrival Forecasting
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F1F3D] mt-1">
                    Prediction powered by operational context
                  </h2>
                  <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                    Every arrival forecast combines live train kinematics with route section running
                    times, historical station delay patterns, weather conditions, and corridor
                    congestion.
                  </p>
                </div>

                {/* Primary ETA Prediction Card */}
                <div className="bg-[#0F1F3D] text-white rounded-2xl p-6 border border-slate-800 space-y-4 shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/80 pb-3.5">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
                        PREDICTED ARRIVAL
                      </span>
                      <p className="text-xs text-slate-300 mt-0.5">
                        #{primaryTrainStatus.train_number} • Next Halt:{' '}
                        <strong className="text-white">
                          {primaryTrainStatus.next_station_name} (
                          {primaryTrainStatus.next_station_code})
                        </strong>
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-md bg-blue-900/90 border border-blue-700 text-[11px] font-mono font-bold text-blue-200">
                      {primaryTrainStatus.data_source || 'UPLOADED DATASET'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                    <div>
                      <p className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white">
                        {primaryTrainStatus.predicted_eta}
                      </p>
                      <p className="text-xs font-mono text-amber-300 mt-1">
                        Range: {primaryTrainStatus.prediction_range}
                      </p>
                    </div>
                    <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800">
                      <span className="text-[11px] text-slate-400 block">Confidence</span>
                      <strong className="text-sm font-mono text-emerald-400 mt-0.5 block">
                        {primaryTrainStatus.prediction_confidence >= 80
                          ? 'High'
                          : primaryTrainStatus.prediction_confidence >= 65
                          ? 'Moderate'
                          : 'Standard'}{' '}
                        ({primaryTrainStatus.prediction_confidence}%)
                      </strong>
                    </div>
                    <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800">
                      <span className="text-[11px] text-slate-400 block">Delay</span>
                      <strong className="text-sm font-mono text-amber-300 mt-0.5 block">
                        {primaryTrainStatus.current_delay_mins <= 0
                          ? 'On Time (0 min)'
                          : `+${primaryTrainStatus.current_delay_mins} min`}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* 6 Operational Feature Chips */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <Gauge className="w-3.5 h-3.5 text-blue-700" />
                      <span>Current Speed</span>
                    </div>
                    <p className="text-base font-bold font-mono text-[#0F1F3D] mt-1">
                      {primaryTrainStatus.current_speed_kmph} km/h
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Current Delay</span>
                    </div>
                    <p className="text-base font-bold font-mono text-[#0F1F3D] mt-1">
                      {primaryTrainStatus.current_delay_mins <= 0
                        ? '0 min'
                        : `+${primaryTrainStatus.current_delay_mins} min`}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <Route className="w-3.5 h-3.5 text-blue-700" />
                      <span>Section Running Time</span>
                    </div>
                    <p className="text-base font-bold font-mono text-[#0F1F3D] mt-1">
                      {nextStop ? `${nextStop.section_predicted_mins} min` : 'N/A'}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <History className="w-3.5 h-3.5 text-blue-700" />
                      <span>Historical Delay</span>
                    </div>
                    <p className="text-base font-bold font-mono text-[#0F1F3D] mt-1">
                      +{primaryTrainStatus.historical_avg_delay_mins} min
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <CloudRain className="w-3.5 h-3.5 text-blue-700" />
                      <span>Weather</span>
                    </div>
                    <p className="text-sm font-bold text-[#0F1F3D] mt-1 truncate">
                      {primaryTrainStatus.weather_condition} ({primaryTrainStatus.weather_temp_c}°C)
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <Activity className="w-3.5 h-3.5 text-blue-700" />
                      <span>Congestion</span>
                    </div>
                    <p className="text-sm font-bold text-[#0F1F3D] mt-1">
                      {primaryTrainStatus.congestion_level} (
                      {Math.round(primaryTrainStatus.congestion_index * 100)}%)
                    </p>
                  </div>
                </div>

                <div className="pt-1 flex flex-wrap items-center gap-3">
                  <Link
                    to={`/status/${primaryTrainStatus.train_number}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold transition-colors"
                  >
                    <span>Inspect Live Train Status</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    to="/demo-control"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs sm:text-sm font-semibold transition-colors"
                  >
                    <Sliders className="w-4 h-4 text-blue-700" />
                    Test Telemetry Override
                  </Link>
                </div>
              </div>

              {/* RIGHT: Large Train Image Showcase */}
              <div className="lg:col-span-5 relative rounded-2xl overflow-hidden bg-[#0B1F3A] min-h-[320px] lg:min-h-full shadow-md border border-slate-200">
                <img
                  src="/images/railway/hero-train.jpg"
                  alt="Modern Indian high-speed express passenger train on railway tracks"
                  loading="lazy"
                  className="w-full h-full object-cover object-[70%_center]"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/90 via-[#0B1F3A]/20 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 text-white space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-700/90 text-[11px] font-bold uppercase tracking-wider">
                    <TrainFront className="w-3.5 h-3.5 text-amber-400" />
                    HistGradientBoosting Quantile Engine
                  </span>
                  <p className="text-base font-extrabold">
                    Dynamic Corridor Arrival Intelligence
                  </p>
                  <p className="text-xs text-blue-100">
                    Real-time P10–P90 arrival windows calibrated across uploaded route stops.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 py-6 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center">
                  <Cpu className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-extrabold text-[#0F1F3D]">
                  ETA prediction unavailable
                </h3>
                <p className="text-sm text-slate-600 max-w-md leading-relaxed">
                  Upload sufficient historical data and telemetry to enable prediction. Once
                  populated, this panel displays live predicted arrival times, P10–P90 ranges, and
                  operational feature contributions.
                </p>
                <div className="pt-1">
                  <Link
                    to="/data"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold transition-colors"
                  >
                    <Database className="w-4 h-4" />
                    OPEN DATA CENTER
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-5 relative rounded-2xl overflow-hidden bg-[#0B1F3A] h-64 sm:h-72 shadow-md border border-slate-200">
                <img
                  src="/images/railway/hero-train.jpg"
                  alt="Modern Indian high-speed express passenger train on railway tracks"
                  loading="lazy"
                  className="w-full h-full object-cover object-[70%_center]"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/85 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <p className="text-sm font-extrabold">AI-Powered Railway ETA Platform</p>
                  <p className="text-xs text-blue-100">
                    Upload railway datasets in the Data Center to activate live ML predictions.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 6. HOW RAILETA WORKS (With Subtle Low-Opacity Railway-Track Background Image) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 w-full">
        <div className="relative overflow-hidden bg-[#0F1F3D] text-white rounded-3xl p-6 sm:p-10 border border-slate-800 shadow-rail-card">
          {/* Subtle Railway-Track Background Image (Low Opacity for Atmosphere) */}
          <div className="absolute inset-0 z-0">
            <img
              src="/images/railway/tracks-atmosphere.jpg"
              alt="Parallel electrified railway tracks stretching into horizon"
              loading="lazy"
              className="w-full h-full object-cover object-center opacity-25"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0F1F3D]/90 via-[#0F1F3D]/80 to-[#0F1F3D]/85" />
          </div>

          <div className="relative z-10 max-w-2xl mb-8">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
              End-to-End Prediction Pipeline
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
              How RailETA Works
            </h2>
            <p className="text-sm text-slate-200 mt-1">
              From raw railway corridor telemetry to calibrated station arrival windows in four
              stages: DATA → FEATURES → ML PREDICTION → ETA.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Subtle Railway Track Connecting Line on Desktop */}
            <div className="hidden md:block absolute top-7 left-12 right-12 h-0.5 bg-blue-600/70 z-0" />

            {howItWorksSteps.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="relative z-10 bg-slate-900/90 backdrop-blur-sm border border-slate-700/90 rounded-2xl p-5 space-y-3 shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-blue-700 text-white font-mono text-xs font-extrabold">
                      {item.step}
                    </span>
                    <Icon className="w-4 h-4 text-amber-400" />
                  </div>
                  <h3 className="text-sm font-extrabold tracking-wider uppercase text-white">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. ROUTE / MAP SECTION: FOLLOW THE JOURNEY (Railway Image Background Surrounding the Interactive Map Card) */}
      <section className="relative mt-16 sm:mt-20 py-16 sm:py-20 overflow-hidden bg-[#0B1F3A] w-full">
        {/* Railway Image Surrounding the Map Card (Never over the interactive Leaflet map) */}
        <div className="absolute inset-0 z-0">
          <img
            src="/images/railway/station-tracks.jpg"
            alt="Indian railway station tracks and express train background"
            loading="lazy"
            className="w-full h-full object-cover object-center opacity-45"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0B1F3A]/88 via-[#0F1F3D]/80 to-[#0B1F3A]/90" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                Interactive Corridor GIS
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                Follow the Journey
              </h2>
              <p className="text-sm text-blue-100 mt-1">
                Live route geometry, station coordinates, and interpolated train position on
                OpenStreetMap.
              </p>
            </div>
            {primaryTrainStatus && (
              <Link
                to={`/status/${primaryTrainStatus.train_number}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-xs sm:text-sm font-bold text-white transition-colors"
              >
                <MapPin className="w-4 h-4 text-amber-400" />
                <span>Open Full Tracking View (#{primaryTrainStatus.train_number})</span>
              </Link>
            )}
          </div>

          <LiveMap
            trainNumber={primaryTrainStatus?.train_number || ''}
            trainName={primaryTrainStatus?.train_name || ''}
            currentLat={primaryTrainStatus?.current_lat || 0}
            currentLng={primaryTrainStatus?.current_lng || 0}
            currentSpeedKmph={primaryTrainStatus?.current_speed_kmph || 0}
            currentDelayMins={primaryTrainStatus?.current_delay_mins || 0}
            nextStationName={primaryTrainStatus?.next_station_name || ''}
            predictedEta={primaryTrainStatus?.predicted_eta || '--:--'}
            predictionConfidence={primaryTrainStatus?.prediction_confidence || 0}
            dataSource={primaryTrainStatus?.data_source || 'UPLOADED DATASET'}
            stops={primaryTrainStatus?.stops || []}
          />
        </div>
      </section>

      {/* ANALYTICS PREVIEW */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-8 w-full">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
              Network Intelligence
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F1F3D] tracking-tight mt-1">
              Analytics Preview
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Delay distribution, ETA prediction error, hourly delay trend, and confidence metrics.
            </p>
          </div>
          <Link
            to="/analytics"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 hover:text-blue-900"
          >
            <span>Explore Full Analytics</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {!hasAnalyticsData || !analytics ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center mx-auto">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-[#0F1F3D]">
              Analytics will appear after sufficient railway data has been uploaded.
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Upload stations, trains, routes, and historical runs in the Data Center to generate
              corridor analytics.
            </p>
            <div>
              <Link
                to="/data"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold shadow-sm transition-colors"
              >
                <Database className="w-4 h-4" />
                OPEN DATA CENTER
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 1. Delay Distribution */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-[#0F1F3D]">Delay Distribution</h3>
                  <p className="text-xs text-slate-500">Uploaded trains grouped by delay bucket</p>
                </div>
                <span className="text-xs font-mono font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                  Active Fleet
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.delay_distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="trains" name="Trains" fill="#1D4ED8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. ETA Error by Horizon */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-[#0F1F3D]">ETA Error Comparison</h3>
                  <p className="text-xs text-slate-500">
                    RailETA ML MAE vs static delay addition across horizons
                  </p>
                </div>
                <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                  MAE: {analytics.kpis.network_mae_mins}m
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.prediction_error_by_horizon}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="horizon" tick={{ fontSize: 11 }} />
                    <YAxis unit="m" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="raileta_mae" name="RailETA MAE" fill="#0F1F3D" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="legacy_ntes_mae" name="Baseline MAE" fill="#94A3B8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 3. Hourly Delay & Speed/Congestion Trend */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-[#0F1F3D]">Corridor Delay Trend</h3>
                  <p className="text-xs text-slate-500">Average delay profile across hours of day</p>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                  Diurnal Profile
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.average_delay_by_hour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                    <YAxis unit="m" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="avg_delay"
                      name="Avg Delay (min)"
                      stroke="#1D4ED8"
                      fill="#DBEAFE"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 4. Prediction Confidence & Accuracy */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-[#0F1F3D]">Prediction Confidence</h3>
                  <p className="text-xs text-slate-500">
                    Percentage of predictions within ±5m and ±10m windows
                  </p>
                </div>
                <span className="text-xs font-mono font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                  {analytics.kpis.prediction_accuracy_pct}% ±5m
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.prediction_accuracy_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis unit="%" domain={[60, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="within_5m"
                      name="Within ±5m (%)"
                      stroke="#1D4ED8"
                      strokeWidth={2.5}
                    />
                    <Line
                      type="monotone"
                      dataKey="within_10m"
                      name="Within ±10m (%)"
                      stroke="#059669"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
