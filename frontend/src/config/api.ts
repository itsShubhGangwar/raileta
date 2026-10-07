/**
 * Centralized API Configuration for RailETA Frontend
 * Uses environment variables via Vite (VITE_API_URL and VITE_WS_URL).
 * Derives WebSocket URLs automatically from VITE_WS_URL or VITE_API_URL.
 */

const PRODUCTION_API_URL = 'https://raileta-backend-objk.onrender.com';
const PRODUCTION_WS_URL = 'wss://raileta-backend-objk.onrender.com';

const fallbackUrl = import.meta.env.DEV ? 'http://localhost:8000' : PRODUCTION_API_URL;
const rawApiUrl = (import.meta.env.VITE_API_URL || fallbackUrl).trim();
const rawWsUrl = (
  import.meta.env.VITE_WS_URL ||
  (import.meta.env.DEV ? '' : PRODUCTION_WS_URL)
).trim();

export const API_BASE_URL = rawApiUrl.replace(/\/+$/, '');

export const WS_BASE_URL = rawWsUrl
  ? rawWsUrl.replace(/\/+$/, '')
  : API_BASE_URL
  ? API_BASE_URL.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://')
  : typeof window !== 'undefined'
  ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
  : '';

export const API_ENDPOINTS = {
  health: `${API_BASE_URL}/api/health`,
  authLogin: `${API_BASE_URL}/api/auth/login`,
  authMe: `${API_BASE_URL}/api/auth/me`,
  authLogout: `${API_BASE_URL}/api/auth/logout`,
  datasets: `${API_BASE_URL}/api/datasets`,
  datasetsSummary: `${API_BASE_URL}/api/datasets/summary`,
  datasetUpload: `${API_BASE_URL}/api/datasets/upload`,
  datasetById: (id: number) => `${API_BASE_URL}/api/datasets/${id}`,
  datasetTemplate: (dtype: string) => `${API_BASE_URL}/api/datasets/templates/${dtype}`,
  mlRetrain: `${API_BASE_URL}/api/ml/retrain`,
  telemetryState: `${API_BASE_URL}/api/telemetry/state`,
  telemetryUpdate: `${API_BASE_URL}/api/telemetry/update`,
  telemetryMode: `${API_BASE_URL}/api/telemetry/mode`,
  telemetryPlayback: `${API_BASE_URL}/api/telemetry/playback`,
  trains: `${API_BASE_URL}/api/trains`,
  trainById: (trainId: string) => `${API_BASE_URL}/api/trains/${trainId}`,
  trainSearch: (query: string) =>
    `${API_BASE_URL}/api/trains/search?q=${encodeURIComponent(query)}`,
  trainStatus: (trainId: string) => `${API_BASE_URL}/api/trains/${trainId}/status`,
  trainEta: (trainId: string) => `${API_BASE_URL}/api/trains/${trainId}/eta`,
  trainRoute: (trainId: string) => `${API_BASE_URL}/api/trains/${trainId}/route`,
  trainDetails: (trainId: string) => `${API_BASE_URL}/api/trains/${trainId}/status`,
  trainAnalytics: (trainId: string) => `${API_BASE_URL}/api/trains/${trainId}/analytics`,
  predictions: `${API_BASE_URL}/api/predictions`,
  predictEta: `${API_BASE_URL}/api/predictions`,
  analytics: `${API_BASE_URL}/api/analytics`,
  trainWebSocket: (trainId: string) => `${WS_BASE_URL}/ws/trains/${trainId}`,
} as const;
