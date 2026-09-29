import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  Clock,
  Cpu,
  Database,
  Gauge,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sliders,
  TrainFront,
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { LiveMap } from '../components/LiveMap';
import { ETACard } from '../components/ETACard';
import { PredictionConfidence } from '../components/PredictionConfidence';
import { TrainTimeline } from '../components/TrainTimeline';
import { StationTable } from '../components/StationTable';
import { LoadingState } from '../components/LoadingState';
import {
  getTrainStatus,
  predictTrainETA,
  searchTrains,
  subscribeToTrainTelemetry,
} from '../services/api';
import { DataSourceBadgeType, StationStop, TrainStatus, TrainSummary } from '../types/railway';

const getDataSourceLabel = (source: DataSourceBadgeType = 'UPLOADED DATASET') => {
  const norm = source.toUpperCase();
  if (norm.includes('MANUAL')) return 'MANUAL TELEMETRY';
  if (norm.includes('UPLOADED') && norm.includes('TELEMETRY')) return 'UPLOADED TELEMETRY';
  if (norm.includes('EXTERNAL')) return 'EXTERNAL API';
  if (norm.includes('SIMULATED')) return 'SIMULATED TELEMETRY';
  return 'UPLOADED DATASET';
};

export const TrainStatusPage: React.FC = () => {
  const { trainNumber } = useParams<{ trainNumber?: string }>();
  const navigate = useNavigate();

  const [train, setTrain] = useState<TrainStatus | null>(null);
  const [availableTrains, setAvailableTrains] = useState<TrainSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStationCode, setSelectedStationCode] = useState<string>('');
  const [liveStreaming, setLiveStreaming] = useState<boolean>(true);

  // Interactive What-If ML Simulator state
  const [simOpen, setSimOpen] = useState<boolean>(false);
  const [simDelay, setSimDelay] = useState<number>(12);
  const [simSpeed, setSimSpeed] = useState<number>(118);
  const [simCongestion, setSimCongestion] = useState<number>(0.28);
  const [simWeather, setSimWeather] = useState<number>(0.1);
  const [simRunning, setSimRunning] = useState<boolean>(false);

  const loadStatus = async (requestedNum?: string) => {
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
        data = await getTrainStatus(targetNum);
      } catch (fetchErr) {
        if (defaultTrainNo && defaultTrainNo.toUpperCase() !== targetNum.toUpperCase()) {
          data = await getTrainStatus(defaultTrainNo);
          navigate(`/status/${data.train_number}`, { replace: true });
        } else {
          throw fetchErr;
        }
      }

      if (
        (!data.stops || data.stops.length === 0) &&
        routedTrain &&
        routedTrain.train_number.toUpperCase() !== data.train_number.toUpperCase()
      ) {
        data = await getTrainStatus(routedTrain.train_number);
        navigate(`/status/${data.train_number}`, { replace: true });
      } else if (!requestedNum && data.train_number) {
        navigate(`/status/${data.train_number}`, { replace: true });
      }

      setTrain(data);
      setSimDelay(data.current_delay_mins);
      setSimSpeed(data.current_speed_kmph);
      setSimCongestion(data.congestion_index);
      const nextStop =
        data.stops.find((s) => s.status === 'Approaching') ||
        data.stops.find((s) => s.status === 'Upcoming') ||
        data.stops[data.stops.length - 1];
      if (nextStop) {
        setSelectedStationCode(nextStop.station_code);
      }
    } catch (err) {
      setTrain(null);
      setError(err instanceof Error ? err.message : 'Unable to fetch live train status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus(trainNumber);
  }, [trainNumber]);

  // Subscribe to WebSocket / Live Telemetry updates for the resolved train
  useEffect(() => {
    if (!liveStreaming || !train?.train_number) return;
    const unsubscribe = subscribeToTrainTelemetry(train.train_number, (update) => {
      setTrain((prev) => {
        if (!prev) return prev;
        const predMap = new Map(
          (update.eta_snapshot?.predictions || []).map((p) => [p.station.code, p])
        );
        const updatedStops =
          predMap.size > 0
            ? prev.stops.map((stop) => {
                const livePred = predMap.get(stop.station_code);
                if (!livePred) return stop;
                return {
                  ...stop,
                  predicted_eta: livePred.predicted_eta,
                  prediction_range: `${livePred.lower_bound} - ${livePred.upper_bound}`,
                  delay_mins: Math.round(livePred.predicted_delay),
                  confidence: Math.round(livePred.confidence),
                };
              })
            : prev.stops;

        return {
          ...prev,
          current_speed_kmph: update.current_speed_kmph,
          current_delay_mins: update.current_delay_mins,
          distance_covered_km: update.distance_covered_km,
          distance_remaining_km: update.distance_remaining_km,
          current_lat: update.current_lat,
          current_lng: update.current_lng,
          predicted_eta: update.predicted_eta,
          prediction_range: update.prediction_range,
          prediction_confidence: update.prediction_confidence,
          data_source: update.data_source || prev.data_source,
          data_mode: update.data_mode || prev.data_mode,
          weather_condition: update.weather_condition || prev.weather_condition,
          congestion_level: update.congestion_level || prev.congestion_level,
          stops: updatedStops,
          last_updated: `Live Stream • ${update.timestamp}`,
        };
      });
    });
    return unsubscribe;
  }, [train?.train_number, liveStreaming]);

  const handleRunSimulation = async () => {
    if (!train || train.stops.length === 0) return;
    setSimRunning(true);
    try {
      const targetStop =
        train.stops.find((s) => s.station_code === selectedStationCode) ||
        train.stops.find((s) => s.status === 'Approaching') ||
        train.stops[train.stops.length - 1];

      const res = await predictTrainETA({
        train_number: train.train_number,
        station_code: targetStop.station_code,
        scheduled_arrival: targetStop.scheduled_arrival,
        current_delay_mins: simDelay,
        distance_remaining_km: Math.max(
          15,
          targetStop.distance_km - train.distance_covered_km
        ),
        current_speed_kmph: simSpeed,
        scheduled_section_speed_kmph: 95,
        historical_station_delay_mins: targetStop.historical_avg_delay_mins,
        congestion_index: simCongestion,
        weather_severity: simWeather,
        hour_of_day: 18,
        train_priority_tier:
          train.train_type === 'Rajdhani' || train.train_type === 'Vande Bharat' ? 1 : 2,
        stops_remaining: 2,
      });

      setTrain((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          current_delay_mins: simDelay,
          current_speed_kmph: simSpeed,
          congestion_index: simCongestion,
          predicted_eta: res.predicted_eta,
          prediction_range: res.prediction_range,
          prediction_confidence: res.confidence,
          running_status:
            simDelay <= 0 ? 'On Time' : `Running Late by ${simDelay}m`,
          stops: prev.stops.map((s) =>
            s.station_code === targetStop.station_code
              ? {
                  ...s,
                  predicted_eta: res.predicted_eta,
                  prediction_range: res.prediction_range,
                  delay_mins: res.predicted_delay_mins,
                  confidence: res.confidence,
                }
              : s
          ),
        };
      });
    } finally {
      setSimRunning(false);
    }
  };

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
        <div className="bg-white rounded-2xl p-10 sm:p-12 border border-slate-200 shadow-sm text-center space-y-5">
          <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center mx-auto">
            <Database className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-[#0F1F3D]">
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
                    onClick={() => navigate(`/status/${t.train_number}`)}
                    className="px-4 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold border border-blue-200 transition-colors"
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
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold shadow-sm transition-colors"
            >
              <Database className="w-4 h-4" />
              OPEN DATA CENTER
            </Link>
            <button
              type="button"
              onClick={() => loadStatus(trainNumber)}
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

  const upcomingStops = train.stops.filter((s) => s.status !== 'Departed');
  const fallbackStop: StationStop = {
    sequence: 1,
    station_code: train.destination_code,
    station_name: train.destination_name,
    platform: '1',
    distance_km: train.total_distance_km || 0,
    lat: train.current_lat,
    lng: train.current_lng,
    scheduled_arrival: '00:00',
    scheduled_departure: '00:00',
    predicted_eta: train.predicted_eta,
    prediction_range: train.prediction_range,
    delay_mins: train.current_delay_mins,
    historical_avg_delay_mins: train.historical_avg_delay_mins,
    section_scheduled_mins: 0,
    section_predicted_mins: 0,
    status: 'Approaching',
    confidence: train.prediction_confidence,
  };
  const selectedStop =
    train.stops.find((s) => s.station_code === selectedStationCode) ||
    upcomingStops[0] ||
    train.stops[train.stops.length - 1] ||
    fallbackStop;

  const dataSourceBadge = getDataSourceLabel(train.data_source);

  return (
    <div className="min-h-screen pb-16">
      {/* Top Sub-Navbar: Train Switcher & Telemetry Controls */}
      <div className="bg-white border-b border-slate-200 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">
              Active Service:
            </span>
            {availableTrains.map((item) => {
              const active = item.train_number === train.train_number;
              return (
                <button
                  key={item.train_number}
                  onClick={() => navigate(`/status/${item.train_number}`)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    active
                      ? 'bg-[#0F1F3D] text-white'
                      : 'bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700'
                  }`}
                >
                  <span className="font-mono">{item.train_number}</span>
                  <span className="hidden sm:inline">{item.train_name}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setLiveStreaming(!liveStreaming)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                liveStreaming
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${liveStreaming ? 'text-emerald-600' : ''}`} />
              {liveStreaming ? 'Live Stream: ON' : 'Stream Paused'}
            </button>

            <Link
              to="/demo-control"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-blue-700" />
              Telemetry Control
            </Link>

            <Link
              to={`/details/${train.train_number}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
            >
              <Navigation className="w-3.5 h-3.5" />
              Route Intelligence
            </Link>
          </div>
        </div>
      </div>

      {/* 1. LARGE RAILWAY / TRAIN BANNER AT TOP OF TRAIN STATUS PAGE (Section 7) */}
      <div className="relative overflow-hidden bg-[#0B1F3A] text-white py-10 sm:py-12 border-b border-blue-900/50">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/railway/corridor-train.jpg"
            alt="Passenger express train travelling on Indian railway corridor"
            loading="eager"
            className="w-full h-full object-cover object-center opacity-55"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/92 via-[#0F1F3D]/78 to-[#0B1F3A]/45" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-400 text-slate-950 font-mono text-xs sm:text-sm font-extrabold uppercase tracking-wider">
                <TrainFront className="w-4 h-4" />
                TRAIN • {train.train_number}
              </span>
              <StatusBadge
                status={train.running_status}
                delayMins={train.current_delay_mins}
                size="md"
                pulse
              />
              <span className="px-3 py-1 rounded-lg bg-white/15 border border-white/25 text-xs font-mono font-bold text-white">
                {dataSourceBadge}
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight drop-shadow-sm">
              {train.train_name}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-sm sm:text-base text-blue-100">
              <span className="font-bold text-white">
                {train.source_name}{' '}
                <span className="font-mono text-xs text-amber-300">({train.source_code})</span>
              </span>
              <ArrowRight className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-white">
                {train.destination_name}{' '}
                <span className="font-mono text-xs text-amber-300">
                  ({train.destination_code})
                </span>
              </span>
              <span className="text-xs text-blue-300">•</span>
              <span className="text-xs font-mono text-blue-100">
                {train.distance_covered_km} km / {train.total_distance_km} km covered
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* 2. LARGE ETA CARD & OPERATIONAL METRICS STRIP */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7">
          <div>
            <ETACard
              stationName={selectedStop.station_name}
              stationCode={selectedStop.station_code}
              scheduledArrival={selectedStop.scheduled_arrival}
              predictedEta={selectedStop.predicted_eta}
              predictionRange={selectedStop.prediction_range}
              confidence={selectedStop.confidence}
              delayMins={selectedStop.delay_mins}
              upcomingStops={upcomingStops}
              selectedStationCode={selectedStop.station_code}
              onSelectStation={setSelectedStationCode}
            />
          </div>

          {/* 3. OPERATIONAL METRICS STRIP: Speed, Delay, Next Station, Confidence, Data Source */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mt-5">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-blue-700" />
                Speed
              </p>
              <p className="text-base font-extrabold font-mono text-[#0F1F3D] mt-1">
                {train.current_speed_kmph} km/h
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                Delay
              </p>
              <p
                className={`text-base font-extrabold font-mono mt-1 ${
                  train.current_delay_mins <= 5 ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {train.current_delay_mins <= 0 ? 'On Time (0m)' : `+${train.current_delay_mins} min`}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-blue-700" />
                Next Station
              </p>
              <p className="text-sm font-bold text-[#0F1F3D] mt-1 truncate">
                {train.next_station_name} ({train.next_station_code})
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Confidence
              </p>
              <p className="text-base font-extrabold font-mono text-[#0F1F3D] mt-1">
                {selectedStop.confidence}%
              </p>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-slate-50 border border-slate-200/90">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 text-blue-700" />
                Data Source
              </p>
              <p className="text-xs font-mono font-bold text-blue-700 mt-1.5 truncate">
                {dataSourceBadge}
              </p>
            </div>
          </div>
        </div>

        {/* 4. LARGE LIVE MAP */}
        <LiveMap
          trainNumber={train.train_number}
          trainName={train.train_name}
          currentLat={train.current_lat}
          currentLng={train.current_lng}
          currentSpeedKmph={train.current_speed_kmph}
          currentDelayMins={train.current_delay_mins}
          nextStationName={train.next_station_name}
          predictedEta={train.predicted_eta}
          predictionConfidence={train.prediction_confidence}
          dataSource={dataSourceBadge}
          stops={train.stops}
        />

        {/* 5. ROUTE TIMELINE */}
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

        {/* 6. STATION TABLE */}
        <StationTable
          stops={train.stops}
          selectedStationCode={selectedStop.station_code}
          onSelectStation={setSelectedStationCode}
        />

        {/* 7. ML PREDICTION DETAILS & WHAT-IF SIMULATOR */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5">
            <PredictionConfidence
              confidence={selectedStop.confidence}
              predictionRange={selectedStop.prediction_range}
              weatherCondition={train.weather_condition}
              congestionLevel={train.congestion_level}
              historicalAvgDelayMins={selectedStop.historical_avg_delay_mins}
            />
          </div>

          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#0F1F3D]">
                      ML Prediction Details & What-If Analysis
                    </h3>
                    <p className="text-xs text-slate-500">
                      Test how speed, delay, weather, and congestion affect arrival at{' '}
                      <strong>{selectedStop.station_name}</strong> ({selectedStop.station_code})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSimOpen(!simOpen)}
                  className="text-xs font-bold text-blue-700 hover:text-blue-900"
                >
                  {simOpen ? 'Hide Controls' : 'Adjust Parameters'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    Section Scheduled
                  </span>
                  <strong className="text-sm font-mono text-[#0F1F3D]">
                    {selectedStop.section_scheduled_mins} min
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    Section Predicted
                  </span>
                  <strong className="text-sm font-mono text-blue-700">
                    {selectedStop.section_predicted_mins} min
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    Historical Avg Delay
                  </span>
                  <strong className="text-sm font-mono text-[#0F1F3D]">
                    +{selectedStop.historical_avg_delay_mins} min
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    Corridor Weather
                  </span>
                  <strong className="text-sm text-[#0F1F3D] truncate block">
                    {train.weather_condition}
                  </strong>
                </div>
              </div>

              {simOpen && (
                <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span>Current Delay (mins)</span>
                      <span className="font-mono text-blue-700">+{simDelay}m</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={120}
                      value={simDelay}
                      onChange={(e) => setSimDelay(Number(e.target.value))}
                      className="w-full accent-blue-700"
                    />
                  </div>

                  <div>
                    <label className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span>Train Speed (km/h)</span>
                      <span className="font-mono text-blue-700">{simSpeed} km/h</span>
                    </label>
                    <input
                      type="range"
                      min={40}
                      max={160}
                      value={simSpeed}
                      onChange={(e) => setSimSpeed(Number(e.target.value))}
                      className="w-full accent-blue-700"
                    />
                  </div>

                  <div>
                    <label className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span>Congestion Index</span>
                      <span className="font-mono text-blue-700">
                        {Math.round(simCongestion * 100)}%
                      </span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={simCongestion}
                      onChange={(e) => setSimCongestion(Number(e.target.value))}
                      className="w-full accent-blue-700"
                    />
                  </div>

                  <div>
                    <label className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span>Weather Severity</span>
                      <span className="font-mono text-blue-700">
                        {Math.round(simWeather * 100)}%
                      </span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={simWeather}
                      onChange={(e) => setSimWeather(Number(e.target.value))}
                      className="w-full accent-blue-700"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Last telemetry sync: <span className="font-mono">{train.last_updated}</span>
              </span>
              <div className="flex items-center gap-2.5">
                {simOpen && (
                  <button
                    type="button"
                    disabled={simRunning}
                    onClick={handleRunSimulation}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition-colors"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    {simRunning ? 'Recalculating...' : 'Run ML Forecast'}
                  </button>
                )}
                <Link
                  to={`/details/${train.train_number}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
                >
                  <span>Full Route Details</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
