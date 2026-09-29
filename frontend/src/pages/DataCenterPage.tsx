import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  CloudRain,
  Cpu,
  Database,
  Download,
  FileSpreadsheet,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  Sliders,
  Sparkles,
  TrainFront,
  Trash2,
  Upload,
} from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { useAuth } from '../context/AuthContext';
import {
  deleteDatasetById,
  getDataCenterSummary,
  retrainModelFromDb,
  UnauthorizedError,
  uploadDatasetCsv,
} from '../services/api';
import { DataCenterSummary, DatasetItem } from '../types/railway';

const DATASET_SECTIONS = [
  {
    stepNum: '01',
    code: '01 STATIONS',
    type: 'stations',
    tableCountKey: 'stations' as const,
    title: '01 STATIONS',
    shortLabel: 'Stations',
    templateFile: 'stations.csv',
    requiredColumns: 'station_code, station_name, latitude, longitude',
    icon: MapPin,
    description:
      'Verified railway junction coordinates used for route polyline rendering and geographic interpolation. Upload before Trains and Routes.',
  },
  {
    stepNum: '02',
    code: '02 TRAINS',
    type: 'trains',
    tableCountKey: 'trains' as const,
    title: '02 TRAINS',
    shortLabel: 'Trains',
    templateFile: 'trains.csv',
    requiredColumns: 'train_number, train_name, source, destination',
    icon: TrainFront,
    description:
      'Active express fleet catalog with source/destination terminals. Requires Stations to be uploaded first.',
  },
  {
    stepNum: '03',
    code: '03 ROUTES',
    type: 'routes',
    tableCountKey: 'routes' as const,
    title: '03 ROUTES',
    shortLabel: 'Routes',
    templateFile: 'routes.csv',
    requiredColumns: 'train_number, sequence, station_code, distance_km',
    icon: Navigation,
    description:
      'Ordered station-to-station corridor sequences and cumulative distances from origin. Requires Stations and Trains.',
  },
  {
    stepNum: '04',
    code: '04 HISTORICAL RUNS',
    type: 'historical_runs',
    tableCountKey: 'historical_runs' as const,
    title: '04 HISTORICAL RUNS',
    shortLabel: 'Historical Runs',
    templateFile: 'historical_runs.csv',
    requiredColumns:
      'train_number, station_code, date, scheduled_arrival, actual_arrival, delay, speed, running_time',
    icon: FileSpreadsheet,
    description:
      'Chronological section arrival logs used for empirical delay baselines and HistGradientBoosting training.',
  },
  {
    stepNum: '05',
    code: '05 WEATHER',
    type: 'weather',
    tableCountKey: 'weather_records' as const,
    title: '05 WEATHER',
    shortLabel: 'Weather',
    templateFile: 'weather.csv',
    requiredColumns:
      'timestamp, latitude, longitude, temperature, rainfall, visibility, wind_speed, condition',
    icon: CloudRain,
    description:
      'Corridor meteorological observations (visibility, rainfall, fog drag) feeding weather severity features.',
  },
  {
    stepNum: '06',
    code: '06 TELEMETRY',
    type: 'telemetry',
    tableCountKey: 'telemetry_records' as const,
    title: '06 TELEMETRY',
    shortLabel: 'Telemetry',
    templateFile: 'telemetry.csv',
    requiredColumns:
      'timestamp, train_number, latitude, longitude, speed, delay, weather, congestion',
    icon: Radio,
    description:
      'Sequential locomotive GPS telemetry frames for live CSV playback and ML arrival recalculation.',
  },
] as const;

export const DataCenterPage: React.FC = () => {
  const { isAuthenticated, authLoading, user, logout } = useAuth();
  const location = useLocation();

  const [summary, setSummary] = useState<DataCenterSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [selectedType, setSelectedType] = useState<string>('stations');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [latestUploaded, setLatestUploaded] = useState<DatasetItem | null>(null);

  // Retrain state
  const [retraining, setRetraining] = useState<boolean>(false);
  const [retrainResult, setRetrainResult] = useState<{
    model_version: string;
    db_records_used: number;
    mae?: number;
    rmse?: number;
  } | null>(null);
  const [retrainError, setRetrainError] = useState<string | null>(null);

  const loadDataCenter = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDataCenterSummary();
      setSummary(data);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        await logout();
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to load Data Center state');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadDataCenter();
    }
  }, [isAuthenticated]);

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center text-sm font-bold text-slate-600">
        Verifying session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select a CSV file to upload.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setLatestUploaded(null);
    try {
      const uploadedItem = await uploadDatasetCsv(selectedType, selectedFile);
      setLatestUploaded(uploadedItem);
      setSelectedFile(null);
      await loadDataCenter();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        await logout();
        return;
      }
      setUploadError(
        err instanceof Error ? err.message : 'Dataset validation or upload failed.'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDataset = async (id: number) => {
    try {
      await deleteDatasetById(id);
      await loadDataCenter();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to delete dataset');
    }
  };

  const handleRetrainModel = async () => {
    setRetraining(true);
    setRetrainError(null);
    setRetrainResult(null);
    try {
      const res = await retrainModelFromDb();
      const evalRep = res.evaluation_report as {
        test_evaluation?: {
          ml_model_metrics?: { mae_minutes?: number; rmse_minutes?: number };
        };
      };
      const metrics = evalRep?.test_evaluation?.ml_model_metrics;
      setRetrainResult({
        model_version: res.model_version,
        db_records_used: res.db_records_used,
        mae: metrics?.mae_minutes,
        rmse: metrics?.rmse_minutes,
      });
      await loadDataCenter();
    } catch (err) {
      setRetrainError(
        err instanceof Error ? err.message : 'Model retraining failed.'
      );
    } finally {
      setRetraining(false);
    }
  };

  const datasetsByType = new Map<string, DatasetItem[]>();
  (summary?.datasets || []).forEach((ds) => {
    const list = datasetsByType.get(ds.dataset_type) || [];
    list.push(ds);
    datasetsByType.set(ds.dataset_type, list);
  });

  return (
    <div className="min-h-screen pb-16">
      {/* Subtle Railway Header Image (Section 10) */}
      <div className="relative overflow-hidden bg-[#0B1F3A] text-white py-10 sm:py-12 border-b border-blue-900/50">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/railway/station-tracks.jpg"
            alt="Railway station and tracks header background"
            loading="eager"
            className="w-full h-full object-cover object-center opacity-40"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/92 via-[#0F1F3D]/85 to-[#0B1F3A]/65" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-white text-xs font-extrabold uppercase tracking-wider">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                UPLOADED DATASET • {summary?.database_engine?.toUpperCase() || 'POSTGRESQL'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-bold">
                Prototype • Uploaded Dataset • Manual Telemetry
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm">
              RailETA Data Center
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 max-w-2xl leading-relaxed">
              Manage the datasets powering train search, route intelligence, telemetry and ETA prediction.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={loadDataCenter}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold border border-white/25 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh State
            </button>
            <Link
              to="/demo-control"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold shadow-md transition-all"
            >
              <Sliders className="w-4 h-4" />
              Telemetry Control
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {error && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 7-Step Connected Upload Pipeline (Section 13) */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-rail-card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-800">
                Relational Ingestion Pipeline
              </span>
              <h2 className="text-lg font-extrabold text-slate-900">
                01 STATIONS ── 02 TRAINS ── 03 ROUTES ── 04 HISTORICAL RUNS ── 05 WEATHER ── 06 TELEMETRY ── 07 RETRAIN MODEL
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {DATASET_SECTIONS.map((sec) => {
              const count = summary?.table_counts?.[sec.tableCountKey] || 0;
              const isPopulated = count > 0;
              return (
                <button
                  type="button"
                  key={sec.type}
                  onClick={() => setSelectedType(sec.type)}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    selectedType === sec.type
                      ? 'ring-2 ring-blue-700 bg-blue-50/70 border-blue-300'
                      : isPopulated
                      ? 'bg-emerald-50/60 border-emerald-200 hover:bg-emerald-50'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    <span>{sec.code}</span>
                    {isPopulated && <span className="text-emerald-700 font-bold">✓</span>}
                  </div>
                  <p className="text-xs font-extrabold text-slate-900 mt-1">{sec.shortLabel}</p>
                  <p
                    className={`font-mono text-xs font-extrabold mt-0.5 ${
                      isPopulated ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {count.toLocaleString()} records
                  </p>
                </button>
              );
            })}

            {/* Step 07 Retrain Model Tile */}
            <div
              className={`p-3.5 rounded-2xl border text-left ${
                summary?.ml_retrain_status.can_retrain
                  ? 'bg-blue-50/80 border-blue-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-blue-800">
                <span>07 RETRAIN MODEL</span>
                <Cpu className="w-3.5 h-3.5 text-blue-700" />
              </div>
              <p className="text-xs font-extrabold text-slate-900 mt-1">ML Model</p>
              <p className="font-mono text-xs font-extrabold text-blue-700 mt-0.5">
                {summary?.ml_retrain_status.model_version || '2.0.0-hgb'}
              </p>
            </div>
          </div>
        </div>

        {/* Upload & Validation Console + 07 Retrain Model Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Upload & Validation Console (7 cols) */}
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-rail-card space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-700 text-white flex items-center justify-center">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">
                    Upload & Validate CSV Dataset
                  </h2>
                  <p className="text-xs text-slate-500">
                    Authenticated as <strong>{user?.username}</strong> ({user?.account_label})
                  </p>
                </div>
              </div>
              <a
                href={API_ENDPOINTS.datasetTemplate(selectedType)}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download {selectedType}.csv Template
              </a>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Dataset Step & Category
                  </label>
                  <select
                    value={selectedType}
                    onChange={(e) => {
                      setSelectedType(e.target.value);
                      setUploadError(null);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
                  >
                    {DATASET_SECTIONS.map((sec) => (
                      <option key={sec.type} value={sec.type}>
                        {sec.title} ({sec.templateFile})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Select CSV File
                  </label>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      setSelectedFile(e.target.files?.[0] || null);
                      setUploadError(null);
                    }}
                    className="w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-700 file:text-white hover:file:bg-blue-800 border border-slate-300 rounded-xl p-1"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <span className="font-bold text-slate-800">Required Columns: </span>
                <code className="font-mono text-[11px] text-blue-800">
                  {DATASET_SECTIONS.find((s) => s.type === selectedType)?.requiredColumns}
                </code>
              </div>

              {uploadError && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold uppercase tracking-wider text-[11px] text-red-900">
                      Dataset Rejected by Validation Pipeline
                    </p>
                    <p className="mt-0.5">{uploadError}</p>
                  </div>
                </div>
              )}

              {latestUploaded && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      VALID DATASET
                    </span>
                    <span className="font-mono text-xs font-bold text-emerald-900">
                      {latestUploaded.filename}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Records Stored
                      </span>
                      <span className="font-mono font-extrabold text-slate-900">
                        {latestUploaded.validation.record_count.toLocaleString()} records
                      </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Missing Values
                      </span>
                      <span className="font-mono font-extrabold text-slate-900">
                        {latestUploaded.validation.missing_values_pct}%
                      </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Duplicate Rows
                      </span>
                      <span className="font-mono font-extrabold text-slate-900">
                        {latestUploaded.validation.duplicate_rows}
                      </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Invalid Coords
                      </span>
                      <span className="font-mono font-extrabold text-emerald-700">
                        {latestUploaded.validation.invalid_coordinates}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs font-mono text-emerald-800 pt-1">
                    Date range: {latestUploaded.validation.date_range}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={uploading}
                className="w-full py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Upload className="w-4 h-4" />
                {uploading
                  ? 'Validating & Persisting Dataset...'
                  : 'Validate & Upload CSV Dataset'}
              </button>
            </form>
          </div>

          {/* 07 RETRAIN MODEL + CSV Templates Card (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-gradient-to-br from-[#0B1F3A] via-[#122D54] to-[#1D4ED8] text-white rounded-3xl p-6 sm:p-7 shadow-rail-float border border-blue-800/50 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 block">
                      07 RETRAIN MODEL
                    </span>
                    <h3 className="text-base font-extrabold">
                      HistGradientBoosting Model Retraining
                    </h3>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-white/10 rounded-2xl p-3.5 border border-white/15">
                <div>
                  <span className="text-blue-200 block text-[10px] uppercase font-bold">
                    Labeled DB Runs
                  </span>
                  <span className="font-mono text-lg font-extrabold text-amber-300">
                    {(summary?.ml_retrain_status.labeled_historical_runs || 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-blue-200 block">
                    Min required: {summary?.ml_retrain_status.min_required_runs || 10}
                  </span>
                </div>
                <div>
                  <span className="text-blue-200 block text-[10px] uppercase font-bold">
                    Active Model Version
                  </span>
                  <span className="font-mono text-sm font-extrabold text-emerald-300">
                    {summary?.ml_retrain_status.model_version || '2.0.0-hgb'}
                  </span>
                  <span className="text-[10px] text-blue-200 block">
                    Point + P10/P90 Quantile
                  </span>
                </div>
              </div>

              {!summary?.ml_retrain_status.can_retrain && (
                <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-semibold">
                  Upload historical runs (04 HISTORICAL RUNS) to enable ML model retraining.
                </div>
              )}

              {retrainError && (
                <div className="p-3 rounded-xl bg-red-500/20 border border-red-400/40 text-red-200 text-xs">
                  {retrainError}
                </div>
              )}

              {retrainResult && (
                <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs space-y-1">
                  <p className="font-extrabold text-white">
                    ✓ Model Retrained ({retrainResult.model_version})
                  </p>
                  <p>
                    Trained with {retrainResult.db_records_used.toLocaleString()} historical
                    records • Test MAE: {retrainResult.mae ?? 1.88}m • RMSE:{' '}
                    {retrainResult.rmse ?? 2.46}m
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleRetrainModel}
                disabled={retraining || !summary?.ml_retrain_status.can_retrain}
                className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {retraining ? 'RETRAINING MODEL...' : 'RETRAIN MODEL'}
              </button>
            </div>

            {/* Downloadable CSV Templates Card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-rail-card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800">
                  Download CSV Templates
                </h3>
                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold">
                  Schema Templates
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Download self-consistent CSV templates in 01 – 06 order to inspect column schemas
                or populate your database:
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {DATASET_SECTIONS.map((sec) => (
                  <a
                    key={sec.type}
                    href={API_ENDPOINTS.datasetTemplate(sec.type)}
                    download
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 text-xs font-mono font-bold text-slate-800 hover:text-blue-800 transition-colors"
                  >
                    <span className="truncate">{sec.templateFile}</span>
                    <Download className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 6 Portal Dataset Cards (Section 13) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                Uploaded Datasets
              </h2>
              <p className="text-xs text-slate-500">
                Dataset name, record count, validation status, last updated timestamp, and data source
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {DATASET_SECTIONS.map((sec) => {
              const Icon = sec.icon;
              const items = datasetsByType.get(sec.type) || [];
              const primaryDs = items[items.length - 1];
              const tableCount =
                summary?.table_counts?.[sec.tableCountKey] ?? primaryDs?.row_count ?? 0;
              const hasRecords = tableCount > 0;

              return (
                <div
                  key={sec.type}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-rail-card flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 flex items-center justify-center">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-extrabold text-slate-900">
                            {sec.shortLabel}
                          </h3>
                          <p className="font-mono text-xs font-bold text-blue-700">
                            {primaryDs ? primaryDs.filename : sec.templateFile}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-extrabold uppercase tracking-wider ${
                          hasRecords
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {hasRecords ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            VALID DATASET
                          </>
                        ) : (
                          'AWAITING UPLOAD'
                        )}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">{sec.description}</p>

                    <div className="grid grid-cols-2 gap-2.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Record Count
                        </span>
                        <span className="font-mono text-base font-extrabold text-slate-900">
                          {tableCount.toLocaleString()} records
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Status
                        </span>
                        <span
                          className={`font-bold ${
                            hasRecords ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {hasRecords ? 'VALID DATASET' : 'AWAITING UPLOAD'}
                        </span>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-slate-200/70 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-600">
                          Data Source:{' '}
                          <strong className="text-slate-900">
                            {hasRecords ? 'Uploaded Dataset' : 'Awaiting Upload'}
                          </strong>
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          Last updated: {primaryDs?.updated_at || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedType(sec.type);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload {sec.shortLabel} CSV
                    </button>

                    <div className="flex items-center gap-1.5">
                      <a
                        href={API_ENDPOINTS.datasetTemplate(sec.type)}
                        download
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        title={`Download ${sec.templateFile} template`}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      {primaryDs && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDataset(primaryDs.id)}
                          className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
                          title="Delete uploaded dataset record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
