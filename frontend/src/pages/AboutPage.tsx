import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  Globe,
  Layers,
  Radio,
  Server,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrainFront,
  Zap,
} from 'lucide-react';

export const AboutPage: React.FC = () => {
  const featureImportances = [
    { name: 'Current Reported Delay (current_delay)', weight: 36, color: 'bg-blue-700' },
    { name: 'Distance to Next Station & Destination Slack', weight: 22, color: 'bg-blue-600' },
    { name: 'Historical Section Running Time & Avg Delay', weight: 16, color: 'bg-indigo-600' },
    { name: 'Outer-Yard & Section Congestion Index', weight: 12, color: 'bg-amber-500' },
    { name: 'Instantaneous Locomotive Speed (current_speed)', weight: 8, color: 'bg-emerald-600' },
    { name: 'Weather Visibility Penalty & Diurnal Hour', weight: 6, color: 'bg-slate-700' },
  ];

  return (
    <div className="min-h-screen pb-16">
      {/* Hero Header with Large Railway Journey Image (Section 12) */}
      <div className="relative overflow-hidden bg-[#0B1F3A] text-white py-16 sm:py-24 border-b border-blue-900/50">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/railway/hero-train.jpg"
            alt="Modern Indian passenger train travelling along electrified railway tracks"
            loading="eager"
            className="w-full h-full object-cover object-[68%_center] lg:object-center opacity-65"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/92 via-[#0B1F3A]/72 to-[#0B1F3A]/25" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-950/85 border border-blue-400/40 text-white text-xs font-bold mb-4 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Product Overview & Architecture
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight max-w-3xl leading-tight drop-shadow-md">
            Intelligent Train ETA Prediction & Journey Visibility
          </h1>
          <p className="text-blue-100 text-base sm:text-lg max-w-2xl mt-4 leading-relaxed drop-shadow-sm">
            RailETA combines uploaded railway datasets, real-time telemetry, route geometry, and
            machine learning to forecast dynamic train arrival times and confidence ranges.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 space-y-10 relative z-20">
        {/* Official Prototype Disclaimer Banner (Required by Section 19 & 21) */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-rail-float flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 block">
                Data Provenance & Transparency
              </span>
              <p className="text-sm font-semibold text-slate-800 mt-0.5 leading-relaxed">
                RailETA is a prototype platform. Unless an authorized external railway data provider
                is configured, live operational data is not sourced directly from Indian Railways.
              </p>
            </div>
          </div>
          <span className="px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-xs font-extrabold shrink-0">
            Prototype • Uploaded Dataset • Manual Telemetry
          </span>
        </div>

        {/* Large Railway Journey Image + "How RailETA Works" Visual Feature (Section 12) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-rail-card overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-6 relative min-h-[260px] sm:min-h-[320px] bg-[#0B1F3A]">
            <img
              src="/images/railway/corridor-train.jpg"
              alt="Express passenger train journey across Indian railway viaduct"
              loading="lazy"
              className="w-full h-full object-cover object-center"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/85 via-transparent to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 text-white">
              <span className="px-2.5 py-1 rounded-md bg-amber-400 text-slate-950 text-[11px] font-extrabold uppercase tracking-wider">
                Corridor Telemetry & ML
              </span>
              <p className="text-base font-extrabold mt-1.5">
                Real-Time Railway Corridor Intelligence
              </p>
            </div>
          </div>

          <div className="lg:col-span-6 p-7 sm:p-9 flex flex-col justify-center space-y-4">
            <span className="text-xs font-extrabold uppercase tracking-widest text-blue-700">
              END-TO-END ARCHITECTURE
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F1F3D]">
              How RailETA Works
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              RailETA ingests station coordinates, express train schedules, ordered route sequences,
              historical section runs, corridor weather, and live GPS telemetry frames. Each update
              triggers a 14-feature engineering pipeline and a three-head HistGradientBoosting
              quantile regressor to deliver accurate station arrival times and P10–P90 confidence
              windows.
            </p>
            <div className="grid grid-cols-4 gap-2 pt-2 text-center">
              {['01 DATA', '02 FEATURES', '03 ML MODEL', '04 LIVE ETA'].map((step) => (
                <div
                  key={step}
                  className="p-2.5 rounded-xl bg-blue-50 border border-blue-200/80 font-mono text-[11px] font-extrabold text-blue-800"
                >
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 1. What is RailETA? & 2. How prediction works */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. What is RailETA? */}
          <div className="bg-white rounded-3xl p-7 sm:p-8 border border-slate-200 shadow-rail-card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-blue-700 text-white flex items-center justify-center">
                <TrainFront className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 block">
                  01 OVERVIEW
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                  What is RailETA?
                </h2>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              RailETA is a modern railway travel portal and intelligent ETA prediction system
              designed to move beyond simple static delay addition (scheduled arrival + current
              delay). By analyzing inter-station route distances, timetable slack recovery,
              historical section running times, weather conditions, and corridor congestion, RailETA
              provides realistic arrival times and P10–P90 expected arrival windows.
            </p>
          </div>

          {/* 2. How prediction works */}
          <div className="bg-white rounded-3xl p-7 sm:p-8 border border-slate-200 shadow-rail-card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#0F1F3D] text-white flex items-center justify-center">
                <Activity className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 block">
                  02 METHODOLOGY
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                  How Prediction Works
                </h2>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Every time a train’s position, speed, or delay updates—whether via automatic route
              simulation, manual telemetry override, or uploaded CSV playback—the backend computes
              remaining station distances, joins historical section baselines from PostgreSQL, and
              runs the gradient-boosted ensemble to output a point ETA, an expected arrival range,
              and a calibrated confidence score.
            </p>
          </div>
        </div>

        {/* 3. Data Pipeline */}
        <div className="bg-white rounded-3xl p-7 sm:p-9 border border-slate-200 shadow-rail-card space-y-6">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 block">
              03 DATA PIPELINE
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 mt-1">
              Relational Dataset & Feature Engineering Pipeline
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              All datasets are uploaded through the Data Center, validated for schema and coordinate
              integrity, and stored persistently in PostgreSQL.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="font-mono text-xs font-extrabold text-blue-700">STEP 01</span>
              <h3 className="text-base font-extrabold text-slate-900">Relational Ingestion</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Stations, Trains, Routes, Historical Runs, Weather, and Telemetry CSV files are
                validated and persisted.
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="font-mono text-xs font-extrabold text-blue-700">STEP 02</span>
              <h3 className="text-base font-extrabold text-slate-900">Feature Extraction</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Extracts 14 operational features including remaining distance, speed ratio,
                historical delay, weather drag, and congestion.
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="font-mono text-xs font-extrabold text-blue-700">STEP 03</span>
              <h3 className="text-base font-extrabold text-slate-900">Quantile Inference</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Evaluates point regression alongside P10 and P90 quantile heads for arrival window
                estimation.
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="font-mono text-xs font-extrabold text-blue-700">STEP 04</span>
              <h3 className="text-base font-extrabold text-slate-900">Live Broadcast</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Persists updated train coordinates and station ETAs and broadcasts frames over
                WebSockets.
              </p>
            </div>
          </div>
        </div>

        {/* 4. ML Model */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white rounded-3xl p-7 sm:p-9 border border-slate-200 shadow-rail-card">
          <div className="lg:col-span-6 space-y-4">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 block">
              04 ML MODEL
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              HistGradientBoosting Quantile Ensemble
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              RailETA uses scikit-learn’s <code className="font-mono text-xs">HistGradientBoostingRegressor</code>{' '}
              trained on historical section arrival data with a time-based train/test split:
            </p>
            <ul className="space-y-2.5 text-sm text-slate-700 pt-1">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-1" />
                <span>
                  <strong>Three-Head Architecture:</strong> Point prediction head plus P10 lower
                  quantile and P90 upper quantile heads for calibrated uncertainty ranges.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-1" />
                <span>
                  <strong>In-App Retraining:</strong> Authenticated users can retrain the model
                  directly on uploaded historical runs in the Data Center.
                </span>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-6 bg-slate-50 rounded-2xl p-6 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                Feature Importance Weights
              </h3>
              <span className="font-mono text-xs font-bold text-blue-700">
                14-Feature Vector
              </span>
            </div>
            <div className="space-y-3">
              {featureImportances.map((feat) => (
                <div key={feat.name} className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>{feat.name}</span>
                    <span className="font-mono text-slate-900">{feat.weight}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${feat.color} rounded-full`}
                      style={{ width: `${feat.weight * 2.2}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 5. Real-Time Architecture & 6. Data Sources */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 5. Real-Time Architecture */}
          <div className="bg-white rounded-3xl p-7 sm:p-8 border border-slate-200 shadow-rail-card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 block">
                  05 REAL-TIME ARCHITECTURE
                </span>
                <h2 className="text-xl font-extrabold text-slate-900">
                  WebSocket Telemetry & Map Synchronization
                </h2>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              FastAPI WebSockets stream live telemetry updates to subscribed clients. The Leaflet
              corridor map interpolates train movement along the uploaded station polyline, updates
              next-station ETA cards, and reflects manual telemetry overrides or CSV playback in
              real time.
            </p>
          </div>

          {/* 6. Data Sources */}
          <div className="bg-white rounded-3xl p-7 sm:p-8 border border-slate-200 shadow-rail-card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 block">
                  06 DATA SOURCES
                </span>
                <h2 className="text-xl font-extrabold text-slate-900">
                  Pluggable Telemetry Providers
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-extrabold text-slate-900 block">UPLOADED DATASET</span>
                <span className="text-slate-500">CSV datasets in Data Center</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-extrabold text-slate-900 block">MANUAL TELEMETRY</span>
                <span className="text-slate-500">Interactive Telemetry Control</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-extrabold text-slate-900 block">SIMULATED TELEMETRY</span>
                <span className="text-slate-500">Route-interpolated simulator</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-extrabold text-slate-900 block">EXTERNAL API</span>
                <span className="text-slate-500">Configurable external provider</span>
              </div>
            </div>
          </div>
        </div>

        {/* 7. Technology Architecture */}
        <div className="bg-white rounded-3xl p-7 sm:p-9 border border-slate-200 shadow-rail-card space-y-6">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 block">
              07 TECHNOLOGY ARCHITECTURE
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 mt-1">
              Full-Stack Production Stack
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-blue-700">FRONTEND</span>
                <Globe className="w-4 h-4 text-blue-700" />
              </div>
              <h4 className="text-sm font-extrabold text-slate-900">
                React + TypeScript + Tailwind
              </h4>
              <p className="text-xs text-slate-600">
                Vite SPA with React Router, Leaflet maps, and Recharts visual analytics.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-blue-700">BACKEND</span>
                <Server className="w-4 h-4 text-blue-700" />
              </div>
              <h4 className="text-sm font-extrabold text-slate-900">
                Python FastAPI + WebSockets
              </h4>
              <p className="text-xs text-slate-600">
                REST APIs, JWT authentication, CSV validation, and live telemetry streaming.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-blue-700">DATABASE</span>
                <Database className="w-4 h-4 text-blue-700" />
              </div>
              <h4 className="text-sm font-extrabold text-slate-900">
                PostgreSQL + SQLAlchemy
              </h4>
              <p className="text-xs text-slate-600">
                Persistent relational storage for stations, trains, routes, runs, and predictions.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-blue-700">MACHINE LEARNING</span>
                <Cpu className="w-4 h-4 text-blue-700" />
              </div>
              <h4 className="text-sm font-extrabold text-slate-900">
                scikit-learn + Joblib
              </h4>
              <p className="text-xs text-slate-600">
                HistGradientBoosting point and quantile regressors for dynamic ETA windows.
              </p>
            </div>
          </div>

          {/* Bottom Action Strip */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-slate-900">
                  Explore RailETA Data Center & Telemetry Control
                </p>
                <p className="text-xs text-slate-500">
                  Upload datasets or adjust live telemetry using the Demo Account
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/data"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-sm transition-all"
              >
                <Database className="w-4 h-4" />
                Open Data Center
              </Link>
              <Link
                to="/demo-control"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all"
              >
                <Sliders className="w-4 h-4" />
                Telemetry Control
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
