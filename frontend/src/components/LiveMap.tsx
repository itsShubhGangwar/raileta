import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Compass, Database, Gauge, MapPin, Navigation, Radio } from 'lucide-react';
import { StationStop } from '../types/railway';

interface LiveMapProps {
  trainNumber: string;
  trainName: string;
  currentLat: number;
  currentLng: number;
  currentSpeedKmph: number;
  currentDelayMins: number;
  nextStationName: string;
  predictedEta: string;
  predictionConfidence?: number;
  dataSource?: string;
  stops: StationStop[];
}

const FitCorridorBounds: React.FC<{
  trainNumber: string;
  stops: StationStop[];
  currentPos: [number, number];
}> = ({ trainNumber, stops, currentPos }) => {
  const map = useMap();
  const corridorKey = `${trainNumber}:${stops
    .map((s) => `${s.station_code}:${s.lat},${s.lng}`)
    .join('|')}`;

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (!stops || stops.length === 0) return;
      const points: [number, number][] = stops.map((s) => [s.lat, s.lng]);
      if (currentPos[0] !== 0 || currentPos[1] !== 0) {
        points.push(currentPos);
      }
      const bounds = L.latLngBounds(points);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [42, 42], maxZoom: 8 });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [corridorKey, map]);

  return null;
};

const createStationIcon = (status: StationStop['status'], code: string) => {
  const isDeparted = status === 'Departed';
  const isApproaching = status === 'Approaching';

  const bg = isDeparted
    ? '#059669'
    : isApproaching
    ? '#F59E0B'
    : '#1E3A8A';

  const border = isApproaching ? '#FEF3C7' : '#FFFFFF';

  return L.divIcon({
    className: 'custom-station-marker',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
        <div style="
          width:${isApproaching ? '18px' : '14px'};
          height:${isApproaching ? '18px' : '14px'};
          border-radius:9999px;
          background:${bg};
          border:2.5px solid ${border};
          box-shadow:0 3px 8px rgba(15,23,42,0.35);
        "></div>
        <span style="
          margin-top:3px;
          padding:1px 5px;
          border-radius:4px;
          background:rgba(11,22,44,0.88);
          color:#FFFFFF;
          font-family:'JetBrains Mono',monospace;
          font-size:10px;
          font-weight:700;
          white-space:nowrap;
          box-shadow:0 2px 4px rgba(0,0,0,0.2);
        ">${code}</span>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const createTrainLocomotiveIcon = (trainNumber: string, speed: number) =>
  L.divIcon({
    className: 'custom-locomotive-marker',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);">
        <div class="train-pulse-ring" style="
          position:absolute;
          width:46px;
          height:46px;
          border-radius:9999px;
          background:rgba(245,158,11,0.45);
        "></div>
        <div style="
          position:relative;
          z-index:10;
          display:flex;
          align-items:center;
          gap:5px;
          padding:5px 10px;
          border-radius:9999px;
          background:linear-gradient(135deg,#0B162C 0%,#1E3A8A 100%);
          color:#FFFFFF;
          border:2px solid #F59E0B;
          box-shadow:0 8px 20px rgba(15,23,42,0.45);
          font-family:'JetBrains Mono',monospace;
          font-size:11px;
          font-weight:800;
          white-space:nowrap;
        ">
          <span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:#F59E0B;"></span>
          <span>#${trainNumber} • ${speed} km/h</span>
        </div>
      </div>
    `,
    iconSize: [110, 36],
    iconAnchor: [55, 18],
  });

export const LiveMap: React.FC<LiveMapProps> = ({
  trainNumber,
  trainName,
  currentLat,
  currentLng,
  currentSpeedKmph,
  currentDelayMins,
  nextStationName,
  predictedEta,
  predictionConfidence = 84,
  dataSource = 'SIMULATED TELEMETRY',
  stops,
}) => {
  const sortedStops = (stops || [])
    .map((s) => ({
      ...s,
      lat: Number(s.latitude ?? s.lat ?? 0),
      lng: Number(s.longitude ?? s.lng ?? 0),
      distance_km: Number(s.distance_from_origin ?? s.distance_km ?? 0),
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && (s.lat !== 0 || s.lng !== 0))
    .sort((a, b) => a.sequence - b.sequence);

  if (sortedStops.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-rail-card p-10 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center mx-auto">
          <Database className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-extrabold text-slate-900">
          No route data available.
        </h3>
        <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
          Upload stations.csv and routes.csv in the Data Center to render the interactive corridor
          map.
        </p>
        <div>
          <Link
            to="/data"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-xs font-extrabold transition-colors"
          >
            <Database className="w-4 h-4 text-amber-400" />
            OPEN DATA CENTER
          </Link>
        </div>
      </div>
    );
  }

  const activeLat =
    Number.isFinite(currentLat) && (currentLat !== 0 || currentLng !== 0)
      ? currentLat
      : sortedStops[0].lat;
  const activeLng =
    Number.isFinite(currentLng) && (currentLat !== 0 || currentLng !== 0)
      ? currentLng
      : sortedStops[0].lng;

  const departedStops = sortedStops.filter((s) => s.status === 'Departed');
  const upcomingStops = sortedStops.filter((s) => s.status !== 'Departed');

  // Full station-to-station corridor polyline
  const fullRouteCoordinates: [number, number][] = sortedStops.map(
    (s) => [s.lat, s.lng] as [number, number]
  );

  const completedCoordinates: [number, number][] = [
    ...departedStops.map((s) => [s.lat, s.lng] as [number, number]),
    [activeLat, activeLng],
  ];

  const upcomingCoordinates: [number, number][] = [
    [activeLat, activeLng],
    ...upcomingStops.map((s) => [s.lat, s.lng] as [number, number]),
  ];

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-rail-card overflow-hidden flex flex-col">
      {/* Map Top Telemetry Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-amber-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-extrabold text-white">
                OpenStreetMap Geographic Corridor Map
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[10px] font-bold text-emerald-300">
                <Radio className="w-3 h-3 animate-pulse" />
                {dataSource}
              </span>
            </div>
            <p className="text-xs text-blue-200 font-mono">
              Lat {activeLat.toFixed(4)}° N, Lng {activeLng.toFixed(4)}° E • Next Halt:{' '}
              {nextStationName}
            </p>
          </div>
        </div>

        {/* Map Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 text-slate-200">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            Passed Stations
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-200">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            Live Train
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-200">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 inline-block" />
            Upcoming Stations
          </span>
        </div>
      </div>

      {/* Interactive Leaflet Map Canvas with OpenStreetMap Tile Layer */}
      <div className="relative h-[440px] sm:h-[510px] w-full bg-slate-100">
        <MapContainer
          center={[activeLat, activeLng]}
          zoom={6}
          scrollWheelZoom={true}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitCorridorBounds
            trainNumber={trainNumber}
            stops={sortedStops}
            currentPos={[activeLat, activeLng]}
          />

          {/* Base Corridor Alignment Line */}
          {fullRouteCoordinates.length > 1 && (
            <Polyline
              positions={fullRouteCoordinates}
              pathOptions={{
                color: '#94A3B8',
                weight: 3,
                opacity: 0.45,
              }}
            />
          )}

          {/* Completed Corridor Polyline */}
          {completedCoordinates.length > 1 && (
            <Polyline
              positions={completedCoordinates}
              pathOptions={{
                color: '#059669',
                weight: 5,
                opacity: 0.92,
              }}
            />
          )}

          {/* Upcoming Corridor Polyline */}
          {upcomingCoordinates.length > 1 && (
            <Polyline
              positions={upcomingCoordinates}
              pathOptions={{
                color: '#1E3A8A',
                weight: 4,
                dashArray: '8 8',
                opacity: 0.88,
              }}
            />
          )}

          {/* Station Markers (Passed + Upcoming) */}
          {sortedStops.map((stop) => (
            <Marker
              key={`${stop.sequence}-${stop.station_code}`}
              position={[stop.lat, stop.lng]}
              icon={createStationIcon(stop.status, stop.station_code)}
            >
              <Popup>
                <div className="p-1 min-w-[195px] space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                    <span className="font-mono text-xs font-extrabold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded">
                      {stop.station_code}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500">
                      PF #{stop.platform} • {stop.distance_km} km
                    </span>
                  </div>
                  <p className="text-sm font-extrabold text-slate-900">{stop.station_name}</p>
                  <div className="grid grid-cols-2 gap-1 text-xs pt-1">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Scheduled</span>
                      <span className="font-mono font-bold text-slate-700">
                        {stop.scheduled_arrival}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Predicted ETA</span>
                      <span className="font-mono font-extrabold text-blue-900">
                        {stop.predicted_eta}
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-700 pt-1 border-t border-slate-100">
                    Confidence: {stop.confidence}% • {stop.status}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Live Train Position Marker with 6 Required Popup Fields */}
          <Marker
            position={[activeLat, activeLng]}
            icon={createTrainLocomotiveIcon(trainNumber, currentSpeedKmph)}
          >
            <Popup>
              <div className="p-1.5 min-w-[225px] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-blue-900 text-white font-mono text-xs font-bold">
                    #{trainNumber}
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-600">
                    Speed: {currentSpeedKmph} km/h
                  </span>
                </div>
                <p className="text-xs font-extrabold text-slate-900">{trainName}</p>
                <div className="text-xs text-slate-600 space-y-1 pt-1 border-t border-slate-100">
                  <div className="flex justify-between">
                    <span>Delay:</span>
                    <strong className="font-mono text-amber-700">
                      {currentDelayMins <= 0 ? 'On Time (0m)' : `+${currentDelayMins} min`}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Next Station:</span>
                    <strong className="text-slate-900">{nextStationName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Predicted ETA:</span>
                    <strong className="font-mono text-blue-900">{predictedEta}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Confidence:</span>
                    <strong className="font-mono text-emerald-700">
                      {predictionConfidence}%
                    </strong>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        </MapContainer>

        {/* Floating Map Overlay Pill */}
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto z-[400] bg-slate-950/90 backdrop-blur-md text-white px-4 py-3 rounded-2xl border border-blue-500/30 shadow-xl flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-amber-400" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-blue-300 font-bold">
                Live Speed
              </p>
              <p className="text-sm font-mono font-extrabold">{currentSpeedKmph} km/h</p>
            </div>
          </div>
          <div className="h-7 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-blue-300 font-bold">
                Next Station
              </p>
              <p className="text-sm font-bold truncate max-w-[150px]">{nextStationName}</p>
            </div>
          </div>
          <div className="h-7 w-px bg-slate-800 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-400" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-blue-300 font-bold">
                Predicted ETA ({predictionConfidence}%)
              </p>
              <p className="text-sm font-mono font-extrabold text-amber-300">{predictedEta}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
