import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CloudRain,
  Compass,
  Cpu,
  Database,
  Download,
  Gauge,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Sliders,
  Sparkles,
  Square,
  TrainFront,
  Upload,
} from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { useAuth } from '../context/AuthContext';
import {
  controlTelemetryPlayback,
  getTelemetrySystemState,
  getTrainStatus,
  searchTrains,
  subscribeToTrainTelemetry,
  switchTelemetryMode,
  UnauthorizedError,
  updateManualTelemetry,
  uploadDatasetCsv,
} from '../services/api';
import {
  TelemetrySystemState,
  TelemetryUpdate,
  TrainStatus,
  TrainSummary,
} from '../types/railway';

export const DemoControlPage: React.FC = () => {
  const { isAuthenticated, authLoading, user, logout } = useAuth();
  const location = useLocation();

  const [trains, setTrains] = useState<TrainSummary[]>([]);
  const [selectedTrainNumber, setSelectedTrainNumber] = useState<string>('');
  const [trainStatus, setTrainStatus] = useState<TrainStatus | null>(null);
  const [sysState, setSysState] = useState<TelemetrySystemState | null>(null);

  // Manual Telemetry form inputs
  const [latitude, setLatitude] = useState<string>('0');
  const [longitude, setLongitude] = useState<string>('0');
  const [speed, setSpeed] = useState<string>('95');
  const [delay, setDelay] = useState<string>('12');
  const [congestion, setCongestion] = useState<string>('Low');
  const [weather, setWeather] = useState<string>('Clear');

  const [updating, setUpdating] = useState<boolean>(false);
  const [switchingMode, setSwitchingMode] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // CSV Playback state
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [playbackBusy, setPlaybackBusy] = useState<boolean>(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadingCsv, setUploadingCsv] = useState<boolean>(false);
  const [liveWsFrame, setLiveWsFrame] = useState<TelemetryUpdate | null>(null);

  const loadInitialState = async (trainNum?: string) => {
    setError(null);
    try {
      const [trainList, telemetryState] = await Promise.all([
        searchTrains({}),
        getTelemetrySystemState(),
      ]);
      setTrains(trainList);
      setSysState(telemetryState);

      if (telemetryState?.playback?.speed_multiplier) {
        setPlaybackSpeed(telemetryState.playback.speed_multiplier);
      }

      if (trainList.length === 0) {
        setTrainStatus(null);
        return;
      }

      const routedTrain = trainList.find((t) => t.has_routes || (t.route_count ?? 0) > 0);
      const targetNum =
        (trainNum && trainList.find((t) => t.train_number === trainNum)?.train_number) ||
        routedTrain?.train_number ||
        trainList[0].train_number;
      if (targetNum !== selectedTrainNumber) {
        setSelectedTrainNumber(targetNum);
      }

      const currentTrain = await getTrainStatus(targetNum);
      setTrainStatus(currentTrain);

      setLatitude(String(currentTrain.current_lat));
      setLongitude(String(currentTrain.current_lng));
      setSpeed(String(currentTrain.current_speed_kmph));
      setDelay(String(currentTrain.current_delay_mins));

      if (currentTrain.congestion_index >= 0.6) setCongestion('High');
      else if (currentTrain.congestion_index >= 0.25) setCongestion('Moderate');
      else setCongestion('Low');

      const wCond = (currentTrain.weather_condition || '').toLowerCase();
      if (wCond.includes('heavy')) setWeather('Heavy Rain');
      else if (wCond.includes('rain')) setWeather('Light Rain');
      else if (wCond.includes('fog') || wCond.includes('mist')) setWeather('Fog / Mist');
      else setWeather('Clear');
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        await logout();
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to load Telemetry Control state');
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadInitialState(selectedTrainNumber);
    }
  }, [isAuthenticated, selectedTrainNumber]);

  // Subscribe to WebSocket updates for the selected train
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsub = subscribeToTrainTelemetry(selectedTrainNumber, (frame) => {
      setLiveWsFrame(frame);
      setTrainStatus((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          current_speed_kmph: frame.current_speed_kmph,
          current_delay_mins: frame.current_delay_mins,
          current_lat: frame.current_lat,
          current_lng: frame.current_lng,
          distance_covered_km: frame.distance_covered_km,
          distance_remaining_km: frame.distance_remaining_km,
          predicted_eta: frame.predicted_eta,
          prediction_range: frame.prediction_range,
          prediction_confidence: frame.prediction_confidence,
          data_source: frame.data_source || prev.data_source,
          data_mode: frame.data_mode || prev.data_mode,
        };
      });
      if (frame.playback) {
        setSysState((prev) =>
          prev
            ? {
                ...prev,
                data_mode: 'UPLOADED_TELEMETRY',
                active_data_source: 'UPLOADED TELEMETRY',
                playback: {
                  ...prev.playback,
                  status: frame.playback!.status,
                  current_index: frame.playback!.current_index,
                  total_records: frame.playback!.total_records,
                  speed_multiplier: frame.playback!.speed_multiplier,
                },
              }
            : prev
        );
      }
    });
    return unsub;
  }, [isAuthenticated, selectedTrainNumber]);

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

  const handleModeSwitch = async (
    mode: 'AUTOMATIC_SIMULATION' | 'MANUAL_CONTROL'
  ) => {
    setSwitchingMode(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await switchTelemetryMode(mode);
      setSysState((prev) =>
        prev
          ? {
              ...prev,
              data_mode: res.data_mode,
              active_data_source: res.active_data_source,
            }
          : prev
      );
      setFeedback(
        mode === 'AUTOMATIC_SIMULATION'
          ? 'Switched to Automatic Simulation (SIMULATED TELEMETRY). Train is advancing along route coordinates.'
          : 'Switched to Manual Control (MANUAL TELEMETRY). Automatic simulator ticks are paused so manual overrides persist.'
      );
      await loadInitialState(selectedTrainNumber);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        await logout();
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to switch data mode');
    } finally {
      setSwitchingMode(false);
    }
  };

  const handleManualUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    setError(null);
    setFeedback(null);
    try {
      const latNum = Number(latitude);
      const lngNum = Number(longitude);
      const speedNum = Number(speed);
      const delayNum = Number(delay);

      if (
        Number.isNaN(latNum) ||
        latNum < -90 ||
        latNum > 90 ||
        Number.isNaN(lngNum) ||
        lngNum < -180 ||
        lngNum > 180
      ) {
        throw new Error('Latitude must be within [-90, 90] and Longitude within [-180, 180].');
      }

      const res = await updateManualTelemetry({
        train_number: selectedTrainNumber,
        latitude: latNum,
        longitude: lngNum,
        speed: speedNum,
        delay: delayNum,
        congestion,
        weather,
      });

      setTrainStatus(res.train_status);
      setLiveWsFrame(res.telemetry_frame);
      setSysState((prev) =>
        prev
          ? {
              ...prev,
              data_mode: 'MANUAL_CONTROL',
              active_data_source: 'MANUAL TELEMETRY',
            }
          : prev
      );
      setFeedback(
        `Updated Manual Telemetry for #${selectedTrainNumber}: Speed=${speedNum} km/h, Delay=${delayNum}m, Weather=${weather}, Congestion=${congestion} → Predicted ETA: ${res.telemetry_frame.predicted_eta} (${res.telemetry_frame.prediction_range}, ${res.telemetry_frame.prediction_confidence}% conf)`
      );
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        await logout();
        return;
      }
      setError(err instanceof Error ? err.message : 'Manual telemetry update failed');
    } finally {
      setUpdating(false);
    }
  };

  const handleUploadTelemetryCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      setError('Select a telemetry.csv file to upload first.');
      return;
    }
    setUploadingCsv(true);
    setError(null);
    setFeedback(null);
    try {
      const ds = await uploadDatasetCsv('telemetry', csvFile);
      setCsvFile(null);
      const updatedState = await getTelemetrySystemState();
      setSysState(updatedState);
      setFeedback(
        `Uploaded & validated ${ds.filename} (${ds.row_count} telemetry records stored). Ready for live playback.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Telemetry CSV upload failed');
    } finally {
      setUploadingCsv(false);
    }
  };

  const handlePlaybackAction = async (
    action: 'start' | 'pause' | 'resume' | 'stop',
    speedOverride?: number
  ) => {
    setPlaybackBusy(true);
    setError(null);
    setFeedback(null);
    const mult = speedOverride ?? playbackSpeed;
    try {
      const res = await controlTelemetryPlayback({
        action,
        train_number: selectedTrainNumber,
        speed_multiplier: mult,
      });
      setSysState((prev) =>
        prev
          ? {
              ...prev,
              data_mode: res.data_mode,
              active_data_source: res.active_data_source,
              playback: res.playback,
            }
          : prev
      );
      if (res.latest_frame) {
        setLiveWsFrame(res.latest_frame);
      }
      setFeedback(
        `Telemetry Playback (${action.toUpperCase()}) at ${mult}x speed • Status: ${res.playback.status}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playback control failed');
    } finally {
      setPlaybackBusy(false);
    }
  };

  const activeMode = sysState?.data_mode || 'AUTOMATIC_SIMULATION';
  const activeSourceBadge =
    activeMode === 'MANUAL_CONTROL'
      ? 'MANUAL TELEMETRY'
      : activeMode === 'UPLOADED_TELEMETRY'
      ? 'UPLOADED TELEMETRY'
      : 'SIMULATED TELEMETRY';

  return (
    <div className="min-h-screen pb-16">
      {/* Subtle Railway Header Background (Section 11) */}
      <div className="relative overflow-hidden bg-[#0B1F3A] text-white py-10 sm:py-12 border-b border-blue-900/50">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/railway/corridor-train.jpg"
            alt="Indian passenger express train telemetry header background"
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
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-extrabold uppercase tracking-wider">
                <Sliders className="w-3.5 h-3.5" />
                {activeSourceBadge}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/25 text-white text-xs font-bold">
                Prototype • Uploaded Dataset • Manual Telemetry ({user?.username})
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm">
              Telemetry Control
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 max-w-2xl leading-relaxed">
              Configure train telemetry, switch data modes, or replay uploaded CSV telemetry streams
              to observe real-time ML arrival predictions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {selectedTrainNumber && (
              <Link
                to={`/status/${selectedTrainNumber}`}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg transition-all"
              >
                <Activity className="w-4 h-4" />
                View Live Status ({selectedTrainNumber})
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
            <Link
              to="/data"
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs sm:text-sm border border-white/25 transition-colors"
            >
              <Database className="w-4 h-4 text-amber-400" />
              Data Center
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* TRAIN & DATA MODE Bar (Section 14 layout) */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-rail-card grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          {/* TRAIN Selector (5 cols) */}
          <div className="lg:col-span-5">
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
              TRAIN
            </label>
            <select
              value={selectedTrainNumber}
              onChange={(e) => setSelectedTrainNumber(e.target.value)}
              disabled={trains.length === 0}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:bg-slate-100 disabled:text-slate-500"
            >
              {trains.length > 0 ? (
                trains.map((t) => (
                  <option key={t.train_number} value={t.train_number}>
                    {t.train_number} • {t.train_name} ({t.source_code} → {t.destination_code})
                  </option>
                ))
              ) : (
                <option value="">Select uploaded train (Upload trains.csv in Data Center)</option>
              )}
            </select>
          </div>

          {/* DATA MODE Selector (7 cols) */}
          <div className="lg:col-span-7">
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
              DATA MODE
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                disabled={switchingMode}
                onClick={() => handleModeSwitch('AUTOMATIC_SIMULATION')}
                className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-extrabold transition-all border ${
                  activeMode === 'AUTOMATIC_SIMULATION'
                    ? 'bg-blue-700 text-white border-blue-700 shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <Radio className="w-4 h-4" />
                Automatic Simulation
              </button>

              <button
                type="button"
                disabled={switchingMode}
                onClick={() => handleModeSwitch('MANUAL_CONTROL')}
                className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-extrabold transition-all border ${
                  activeMode === 'MANUAL_CONTROL'
                    ? 'bg-blue-700 text-white border-blue-700 shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <Sliders className="w-4 h-4" />
                Manual Control
              </button>

              <button
                type="button"
                disabled={playbackBusy || trains.length === 0}
                onClick={() => handlePlaybackAction('start')}
                className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-extrabold transition-all border ${
                  activeMode === 'UPLOADED_TELEMETRY'
                    ? 'bg-blue-700 text-white border-blue-700 shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <Play className="w-4 h-4" />
                Uploaded Telemetry
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm font-semibold flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {feedback && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-semibold flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Main 2-Column Grid: Left = Telemetry Controls (7 cols), Right = Prediction Result + CSV Playback (5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Telemetry Controls Card (Section 14) */}
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-rail-card space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-700 text-white flex items-center justify-center">
                  <TrainFront className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">
                    Telemetry Controls
                  </h2>
                  <p className="text-xs text-slate-500">
                    Latitude • Longitude • Speed • Delay • Weather • Congestion
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-xs font-extrabold">
                MANUAL TELEMETRY
              </span>
            </div>

            {trains.length === 0 && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs sm:text-sm font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-700 shrink-0" />
                  <span>Upload train data before using Telemetry Controls.</span>
                </div>
                <Link
                  to="/data"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-extrabold shrink-0"
                >
                  <Database className="w-3.5 h-3.5" />
                  OPEN DATA CENTER
                </Link>
              </div>
            )}

            <form onSubmit={handleManualUpdateSubmit} className="space-y-5">
              {/* Quick Route Station Coordinate Presets */}
              {trainStatus && trainStatus.stops && trainStatus.stops.length > 0 && (
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Snap Coordinates to Route Station:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {trainStatus.stops.map((stop) => (
                      <button
                        key={stop.station_code}
                        type="button"
                        onClick={() => {
                          setLatitude(String(stop.lat));
                          setLongitude(String(stop.lng));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-800 border border-slate-200 text-xs font-mono font-bold transition-colors"
                      >
                        {stop.station_code} ({stop.lat.toFixed(2)}, {stop.lng.toFixed(2)})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Latitude & Longitude */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Latitude
                  </label>
                  <div className="relative">
                    <Compass className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="number"
                      step="0.0001"
                      min="-90"
                      max="90"
                      required
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Longitude
                  </label>
                  <div className="relative">
                    <Compass className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="number"
                      step="0.0001"
                      min="-180"
                      max="180"
                      required
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                  </div>
                </div>
              </div>

              {/* Speed & Delay */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Speed
                  </label>
                  <div className="relative">
                    <Gauge className="w-4 h-4 text-blue-700 absolute left-3.5 top-3.5" />
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="200"
                      required
                      value={speed}
                      onChange={(e) => setSpeed(e.target.value)}
                      className="w-full pl-10 pr-14 py-2.5 rounded-xl border border-slate-300 font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <span className="absolute right-3.5 top-3 text-xs font-bold text-slate-400">
                      km/h
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Delay
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-amber-600 absolute left-3.5 top-3.5" />
                    <input
                      type="number"
                      step="1"
                      min="-15"
                      max="480"
                      required
                      value={delay}
                      onChange={(e) => setDelay(e.target.value)}
                      className="w-full pl-10 pr-12 py-2.5 rounded-xl border border-slate-300 font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <span className="absolute right-3.5 top-3 text-xs font-bold text-slate-400">
                      min
                    </span>
                  </div>
                </div>
              </div>

              {/* Weather & Congestion */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Weather
                  </label>
                  <div className="relative">
                    <CloudRain className="w-4 h-4 text-blue-600 absolute left-3.5 top-3.5 pointer-events-none" />
                    <select
                      value={weather}
                      onChange={(e) => setWeather(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
                    >
                      <option value="Clear">Clear</option>
                      <option value="Light Rain">Light Rain</option>
                      <option value="Heavy Rain">Heavy Rain</option>
                      <option value="Fog / Mist">Fog / Mist</option>
                      <option value="Storm">Storm</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Congestion
                  </label>
                  <select
                    value={congestion}
                    onChange={(e) => setCongestion(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
                  >
                    <option value="Low">Low</option>
                    <option value="Moderate">Moderate</option>
                    <option value="High">High</option>
                    <option value="Severe">Severe</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={updating || trains.length === 0}
                className="w-full py-3.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                {updating ? 'UPDATING TELEMETRY...' : 'UPDATE TELEMETRY'}
              </button>
            </form>
          </div>

          {/* Right Column: Prediction Result + CSV Telemetry Playback (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Prediction Result Card (Section 14) */}
            <div className="bg-gradient-to-br from-[#0B1F3A] via-[#122D54] to-[#1D4ED8] text-white rounded-3xl p-6 sm:p-7 shadow-rail-float border border-blue-800/50 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-extrabold">
                    Prediction Result
                  </h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-white/15 border border-white/20 text-white text-[11px] font-bold font-mono">
                  {activeSourceBadge}
                </span>
              </div>

              {trainStatus ? (
                <>
                  <div className="grid grid-cols-3 gap-3 bg-white/10 rounded-2xl p-4 border border-white/15">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-blue-200 font-bold block">
                        ETA ({trainStatus.next_station_code})
                      </span>
                      <span className="font-mono text-2xl font-extrabold text-amber-300 mt-0.5 block">
                        {trainStatus.predicted_eta}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-blue-200 font-bold block">
                        Range
                      </span>
                      <span className="font-mono text-sm font-extrabold text-white mt-1.5 block">
                        {trainStatus.prediction_range}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-blue-200 font-bold block">
                        Confidence
                      </span>
                      <span className="font-mono text-2xl font-extrabold text-emerald-300 mt-0.5 block">
                        {trainStatus.prediction_confidence}%
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-blue-100 font-mono flex items-center justify-between pt-1">
                    <span>
                      Speed: {trainStatus.current_speed_kmph} km/h • Delay: {trainStatus.current_delay_mins}m
                    </span>
                    <Link
                      to={`/status/${selectedTrainNumber}`}
                      className="text-amber-300 hover:underline font-sans font-bold inline-flex items-center gap-1"
                    >
                      Live Status <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-2xl bg-white/10 border border-white/15 text-xs text-blue-100">
                  No train data uploaded yet. Upload stations, trains, and routes in the Data
                  Center to inspect live ML arrival predictions.
                </div>
              )}
            </div>

            {/* Uploaded Telemetry CSV Playback Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-rail-card space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                    UPLOADED TELEMETRY
                  </span>
                  <h3 className="text-lg font-extrabold text-slate-900 mt-1">
                    Telemetry CSV Playback
                  </h3>
                </div>
                <a
                  href={API_ENDPOINTS.datasetTemplate('telemetry')}
                  download
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  telemetry.csv
                </a>
              </div>

              <p className="text-xs text-slate-500">
                Stream uploaded <code className="font-mono">telemetry.csv</code> frames through the
                live ML prediction and WebSocket pipeline.
              </p>

              {(sysState?.playback?.total_records ?? 0) === 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>No telemetry data available. Upload telemetry.csv first.</span>
                </div>
              )}

              {/* Playback Speed Selector: 1x, 2x, 5x, 10x */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-slate-600">
                    Playback Speed
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    {sysState?.playback?.current_index || 0} /{' '}
                    {sysState?.playback?.total_records || 0} frames ({sysState?.playback?.status || 'STOPPED'})
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 5, 10].map((mult) => (
                    <button
                      key={mult}
                      type="button"
                      onClick={() => {
                        setPlaybackSpeed(mult);
                        if (sysState?.playback?.status === 'PLAYING') {
                          handlePlaybackAction('resume', mult);
                        }
                      }}
                      className={`py-2 rounded-xl font-mono text-xs font-extrabold border transition-all ${
                        playbackSpeed === mult
                          ? 'bg-blue-700 text-white border-blue-700 shadow-sm'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {mult}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Primary [ PLAY TELEMETRY ] CTA */}
              <button
                type="button"
                disabled={playbackBusy}
                onClick={() => handlePlaybackAction('start')}
                className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                PLAY TELEMETRY ({playbackSpeed}x)
              </button>

              {/* Playback Controls: Start | Pause | Resume | Stop */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  disabled={playbackBusy}
                  onClick={() => handlePlaybackAction('start')}
                  className="flex items-center justify-center gap-1 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start
                </button>
                <button
                  type="button"
                  disabled={playbackBusy}
                  onClick={() => handlePlaybackAction('pause')}
                  className="flex items-center justify-center gap-1 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition-colors"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </button>
                <button
                  type="button"
                  disabled={playbackBusy}
                  onClick={() => handlePlaybackAction('resume')}
                  className="flex items-center justify-center gap-1 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-bold transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Resume
                </button>
                <button
                  type="button"
                  disabled={playbackBusy}
                  onClick={() => handlePlaybackAction('stop')}
                  className="flex items-center justify-center gap-1 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-900 border border-red-200 text-xs font-bold transition-colors"
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop
                </button>
              </div>

              {liveWsFrame && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-700 space-y-1">
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>WS Frame #{liveWsFrame.train_number}</span>
                    <span>ETA: {liveWsFrame.predicted_eta}</span>
                  </div>
                  <div>
                    Speed: {liveWsFrame.current_speed_kmph} km/h • Delay:{' '}
                    {liveWsFrame.current_delay_mins}m • ({liveWsFrame.current_lat},{' '}
                    {liveWsFrame.current_lng})
                  </div>
                </div>
              )}

              {/* Quick Upload Custom telemetry.csv */}
              <form
                onSubmit={handleUploadTelemetryCsv}
                className="pt-3 border-t border-slate-100 space-y-2.5"
              >
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Upload Custom telemetry.csv
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                    className="flex-1 text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-200 file:text-slate-800"
                  />
                  <button
                    type="submit"
                    disabled={uploadingCsv}
                    className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shrink-0 inline-flex items-center gap-1"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingCsv ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
