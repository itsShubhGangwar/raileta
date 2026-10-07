import { API_ENDPOINTS } from '../config/api';
import {
  AnalyticsData,
  AuthUser,
  DataCenterSummary,
  DatasetItem,
  PredictETARequest,
  PredictETAResponse,
  StationStop,
  TelemetrySystemState,
  TelemetryUpdate,
  TrainStatus,
  TrainSummary,
} from '../types/railway';

const AUTH_TOKEN_KEY = 'raileta_session_jwt';

export function getAuthToken(): string | null {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // Ignore storage quota errors
  }
}

export function clearAuthToken(): void {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Ignore
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Session expired or authentication required.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export interface SearchFilters {
  q?: string;
  from?: string;
  to?: string;
  date?: string;
  trainType?: string;
}

export interface TrainETAPayload {
  train: {
    id: number;
    train_number: string;
    train_name: string;
    train_type: string;
    zone: string;
    source: string;
    destination: string;
    status: string;
    data_source?: string;
    telemetry_source?: string;
  };
  current_position: {
    latitude: number;
    longitude: number;
    distance_covered_km: number;
    distance_remaining_km: number;
    previous_station_code: string;
    next_station_code: string;
    timestamp: string;
  };
  current_speed: number;
  current_delay: number;
  next_station: {
    id?: number;
    code: string;
    name: string;
    latitude: number;
    longitude: number;
    sequence?: number;
    distance_from_origin?: number;
    platform?: string;
  };
  predictions: Array<{
    station: {
      id?: number;
      code: string;
      name: string;
      latitude: number;
      longitude: number;
      sequence?: number;
      distance_from_origin?: number;
      platform?: string;
    };
    scheduled_eta: string;
    predicted_eta: string;
    predicted_delay: number;
    confidence: number;
    lower_bound: string;
    upper_bound: string;
  }>;
  last_updated: string;
  data_source?: string;
  data_mode?: string;
}

export function interpolateStopsPosition(
  stops: StationStop[],
  distanceCoveredKm: number,
  totalDistanceKm: number
): { lat: number; lng: number; prevCode: string; nextCode: string } {
  if (!stops || stops.length === 0) {
    return { lat: 0, lng: 0, prevCode: '', nextCode: '' };
  }
  const sorted = [...stops].sort((a, b) => a.sequence - b.sequence);
  if (sorted.length === 1) {
    return {
      lat: sorted[0].lat,
      lng: sorted[0].lng,
      prevCode: sorted[0].station_code,
      nextCode: sorted[0].station_code,
    };
  }
  const clamped = Math.max(0, Math.min(totalDistanceKm, distanceCoveredKm));
  let stopA = sorted[0];
  let stopB = sorted[1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (clamped >= sorted[i].distance_km && clamped <= sorted[i + 1].distance_km) {
      stopA = sorted[i];
      stopB = sorted[i + 1];
      break;
    }
  }
  const segLen = Math.max(0.1, stopB.distance_km - stopA.distance_km);
  const ratio = Math.max(0, Math.min(1, (clamped - stopA.distance_km) / segLen));
  const lat = Number((stopA.lat + ratio * (stopB.lat - stopA.lat)).toFixed(5));
  const lng = Number((stopA.lng + ratio * (stopB.lng - stopA.lng)).toFixed(5));
  return {
    lat,
    lng,
    prevCode: stopA.station_code,
    nextCode: stopB.station_code,
  };
}

async function fetchWithTimeout<T>(
  url: string,
  options?: RequestInit,
  timeoutMs = 45000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      new DOMException(
        'The request timed out. The backend server on Render may be waking up from sleep.',
        'TimeoutError'
      )
    );
  }, timeoutMs);

  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options?.headers as Record<string, string>) || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
    });
    if (response.status === 401 || response.status === 403) {
      let detail = 'Authentication required or session expired.';
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {
        // Ignore
      }
      throw new UnauthorizedError(detail);
    }
    if (!response.ok) {
      let detail = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {
        // Ignore
      }
      throw new Error(detail);
    }
    return (await response.json()) as T;
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    const err = error as Error | undefined;
    if (
      err?.name === 'AbortError' ||
      err?.name === 'TimeoutError' ||
      controller.signal.aborted ||
      String(err?.message || '').toLowerCase().includes('aborted')
    ) {
      throw new Error(
        'The request timed out. The backend server on Render may be waking up from sleep. Please wait a moment and try again.'
      );
    }
    if (err?.name === 'TypeError' && String(err?.message || '').includes('Failed to fetch')) {
      throw new Error(
        'Unable to connect to the backend server. Please verify your internet connection or check if the backend is waking up.'
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function loginWithCredentials(
  username: string,
  password: string
): Promise<{ access_token: string; user: AuthUser }> {
  const res = await fetchWithTimeout<{ access_token: string; user: AuthUser }>(
    API_ENDPOINTS.authLogin,
    {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    },
    60000
  );
  setAuthToken(res.access_token);
  return res;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  return await fetchWithTimeout<AuthUser>(API_ENDPOINTS.authMe);
}

export async function logoutSession(): Promise<void> {
  try {
    await fetchWithTimeout(API_ENDPOINTS.authLogout, { method: 'POST' });
  } catch {
    // Ignore logout network error
  } finally {
    clearAuthToken();
  }
}

export async function getDataCenterSummary(): Promise<DataCenterSummary> {
  return await fetchWithTimeout<DataCenterSummary>(API_ENDPOINTS.datasetsSummary);
}

export async function uploadDatasetCsv(
  datasetType: string,
  file: File,
  customName?: string
): Promise<DatasetItem> {
  const formData = new FormData();
  formData.append('dataset_type', datasetType);
  if (customName) {
    formData.append('name', customName);
  }
  formData.append('file', file);
  return await fetchWithTimeout<DatasetItem>(
    API_ENDPOINTS.datasetUpload,
    {
      method: 'POST',
      body: formData,
    },
    60000
  );
}

export async function deleteDatasetById(datasetId: number): Promise<void> {
  await fetchWithTimeout(API_ENDPOINTS.datasetById(datasetId), {
    method: 'DELETE',
  });
}

export async function retrainModelFromDb(): Promise<{
  status: string;
  model_version: string;
  db_records_used: number;
  evaluation_report: Record<string, unknown>;
}> {
  return await fetchWithTimeout(
    API_ENDPOINTS.mlRetrain,
    {
      method: 'POST',
    },
    90000
  );
}

export async function getTelemetrySystemState(): Promise<TelemetrySystemState> {
  return await fetchWithTimeout<TelemetrySystemState>(API_ENDPOINTS.telemetryState);
}

export async function updateManualTelemetry(payload: {
  train_number: string;
  latitude?: number;
  longitude?: number;
  speed: number;
  delay: number;
  congestion: string;
  weather: string;
}): Promise<{
  status: string;
  data_mode: string;
  data_source: string;
  telemetry_frame: TelemetryUpdate;
  train_status: TrainStatus;
}> {
  return await fetchWithTimeout(API_ENDPOINTS.telemetryUpdate, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function switchTelemetryMode(
  dataMode: 'AUTOMATIC_SIMULATION' | 'MANUAL_CONTROL' | 'UPLOADED_TELEMETRY' | 'EXTERNAL_API'
): Promise<{
  status: string;
  data_mode: string;
  active_data_source: string;
}> {
  return await fetchWithTimeout(API_ENDPOINTS.telemetryMode, {
    method: 'POST',
    body: JSON.stringify({ data_mode: dataMode }),
  });
}

export async function controlTelemetryPlayback(payload: {
  action: 'start' | 'pause' | 'resume' | 'stop';
  train_number: string;
  speed_multiplier: number;
}): Promise<{
  status: string;
  action: string;
  data_mode: string;
  active_data_source: string;
  playback: TelemetrySystemState['playback'];
  latest_frame?: TelemetryUpdate;
}> {
  return await fetchWithTimeout(API_ENDPOINTS.telemetryPlayback, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function searchTrains(filters: SearchFilters = {}): Promise<TrainSummary[]> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.from) params.set('from_station', filters.from);
  if (filters.to) params.set('to_station', filters.to);
  if (filters.trainType && filters.trainType !== 'All') params.set('train_type', filters.trainType);

  const baseEndpoint = filters.q ? `${API_ENDPOINTS.trains}/search` : API_ENDPOINTS.trains;
  const url = params.toString() ? `${baseEndpoint}?${params.toString()}` : baseEndpoint;

  return await fetchWithTimeout<TrainSummary[]>(url);
}

export interface TrainRoutePayload {
  train_id?: number;
  train_number: string;
  train_name: string;
  source_code: string;
  destination_code: string;
  total_distance_km: number;
  distance_covered_km?: number;
  distance_remaining_km?: number;
  current_lat?: number;
  current_lng?: number;
  current_speed_kmph?: number;
  current_delay_mins?: number;
  next_station_code?: string;
  next_station_name?: string;
  predicted_eta?: string;
  prediction_confidence?: number;
  route: StationStop[];
  stops?: StationStop[];
}

function normalizeStopCoordinates(stop: StationStop): StationStop {
  const lat = Number(stop.latitude ?? stop.lat ?? 0);
  const lng = Number(stop.longitude ?? stop.lng ?? 0);
  const distKm = Number(stop.distance_from_origin ?? stop.distance_km ?? 0);
  return {
    ...stop,
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    distance_km: distKm,
    distance_from_origin: distKm,
  };
}

export async function resolveDefaultTrainNumber(preferred?: string): Promise<string> {
  const trimmed = (preferred || '').trim();
  if (trimmed) return trimmed;
  const trains = await searchTrains({});
  if (!trains || trains.length === 0) {
    throw new Error('No train data available. Upload stations.csv, trains.csv, and routes.csv in the Data Center.');
  }
  const routedTrain = trains.find((t) => t.has_routes || (t.route_count ?? 0) > 0);
  return (routedTrain || trains[0]).train_number;
}

export async function getTrainRoute(trainNumber: string): Promise<TrainRoutePayload> {
  const normalized = await resolveDefaultTrainNumber(trainNumber);
  const data = await fetchWithTimeout<TrainRoutePayload>(API_ENDPOINTS.trainRoute(normalized));
  const rawStops = data.route || data.stops || [];
  const normalizedStops = rawStops
    .map(normalizeStopCoordinates)
    .sort((a, b) => a.sequence - b.sequence);
  return {
    ...data,
    route: normalizedStops,
    stops: normalizedStops,
  };
}

export async function getTrainStatus(trainNumber: string): Promise<TrainStatus> {
  const normalized = await resolveDefaultTrainNumber(trainNumber);
  const [statusData, routeData, etaData] = await Promise.all([
    fetchWithTimeout<TrainStatus>(API_ENDPOINTS.trainStatus(normalized)),
    getTrainRoute(normalized).catch(() => null),
    fetchWithTimeout<TrainETAPayload>(API_ENDPOINTS.trainEta(normalized)).catch(() => null),
  ]);

  const rawStops =
    routeData && routeData.route && routeData.route.length > 0
      ? routeData.route
      : statusData.stops || [];

  statusData.stops = rawStops
    .map(normalizeStopCoordinates)
    .sort((a, b) => a.sequence - b.sequence);

  if (etaData && etaData.predictions && etaData.predictions.length > 0) {
    const predMap = new Map(etaData.predictions.map((p) => [p.station.code, p]));
    statusData.stops = statusData.stops.map((stop) => {
      const p = predMap.get(stop.station_code);
      if (!p) return stop;
      return {
        ...stop,
        predicted_eta: p.predicted_eta,
        prediction_range: `${p.lower_bound} - ${p.upper_bound}`,
        delay_mins: Math.round(p.predicted_delay),
        confidence: Math.round(p.confidence),
      };
    });
  }
  return statusData;
}

export async function getTrainETA(trainNumber: string): Promise<TrainETAPayload> {
  const normalized = await resolveDefaultTrainNumber(trainNumber);
  return await fetchWithTimeout<TrainETAPayload>(API_ENDPOINTS.trainEta(normalized));
}

export async function getTrainDetails(trainNumber: string): Promise<TrainStatus> {
  return await getTrainStatus(trainNumber);
}

export async function predictTrainETA(payload: PredictETARequest): Promise<PredictETAResponse> {
  return await fetchWithTimeout<PredictETAResponse>(API_ENDPOINTS.predictions, {
    method: 'POST',
    body: JSON.stringify({
      train_number: payload.train_number,
      station_code: payload.station_code,
      scheduled_eta: payload.scheduled_arrival,
      current_delay: payload.current_delay_mins,
      current_speed: payload.current_speed_kmph,
      distance_to_next_station: Math.min(payload.distance_remaining_km, 110),
      distance_to_destination: payload.distance_remaining_km,
      historical_section_running_time: 140,
      historical_average_delay: payload.historical_station_delay_mins,
      day_of_week: 1,
      hour: payload.hour_of_day,
      weather: payload.weather_severity,
      congestion: payload.congestion_index,
      previous_station_delay: payload.current_delay_mins,
    }),
  });
}

export async function getAnalyticsData(trainId?: string): Promise<AnalyticsData> {
  if (trainId) {
    try {
      return await fetchWithTimeout<AnalyticsData>(API_ENDPOINTS.trainAnalytics(trainId));
    } catch {
      return await fetchWithTimeout<AnalyticsData>(`${API_ENDPOINTS.trains.replace('/trains', '')}/analytics`);
    }
  }
  return await fetchWithTimeout<AnalyticsData>(`${API_ENDPOINTS.trains.replace('/trains', '')}/analytics`);
}

/**
 * Connects to `WS /ws/trains/{trainNumber}` with automatic reconnect handling.
 * Does not fabricate fake client-side trains when database is empty.
 */
export function subscribeToTrainTelemetry(
  trainNumber: string,
  onUpdate: (update: TelemetryUpdate) => void
): () => void {
  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const connectWebSocket = () => {
    if (closed) return;
    try {
      ws = new WebSocket(API_ENDPOINTS.trainWebSocket(trainNumber));
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as TelemetryUpdate;
          if (data.type === 'TELEMETRY_UPDATE') {
            onUpdate(data);
          }
        } catch {
          // Ignore malformed frame
        }
      };
      ws.onclose = () => {
        if (!closed) {
          reconnectTimeout = setTimeout(connectWebSocket, 6000);
        }
      };
    } catch {
      // Ignore WebSocket connection error
    }
  };

  connectWebSocket();

  return () => {
    closed = true;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  };
}
