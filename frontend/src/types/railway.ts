export type StopStatus = 'Departed' | 'Current' | 'Approaching' | 'Upcoming';

export type DataSourceBadgeType =
  | 'SIMULATED LIVE'
  | 'MANUAL TELEMETRY'
  | 'UPLOADED TELEMETRY'
  | 'EXTERNAL API'
  | string;

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_demo: boolean;
  account_label: string;
  created_at: string;
}

export interface DatasetValidationSummary {
  valid: boolean;
  record_count: number;
  missing_values_pct: number;
  duplicate_rows: number;
  invalid_coordinates: number;
  date_range?: string;
  columns_validated: string[];
  notes?: string;
}

export interface DatasetItem {
  id: number;
  name: string;
  dataset_type: string;
  filename: string;
  row_count: number;
  status: string;
  source_type: string;
  uploaded_by: string;
  validation: DatasetValidationSummary;
  created_at: string;
  updated_at: string;
}

export interface DataCenterSummary {
  database_engine: string;
  persistent: boolean;
  datasets: DatasetItem[];
  table_counts: {
    historical_runs: number;
    trains: number;
    stations: number;
    routes: number;
    weather_records: number;
    telemetry_records: number;
  };
  ml_retrain_status: {
    can_retrain: boolean;
    labeled_historical_runs: number;
    min_required_runs: number;
    model_version: string;
    trained_at?: string;
  };
}

export interface TelemetrySystemState {
  data_mode: 'AUTOMATIC_SIMULATION' | 'MANUAL_CONTROL' | 'UPLOADED_TELEMETRY' | 'EXTERNAL_API' | string;
  active_data_source: DataSourceBadgeType;
  playback: {
    status: 'STOPPED' | 'PLAYING' | 'PAUSED' | 'COMPLETED' | string;
    speed_multiplier: number;
    train_number: string;
    current_index: number;
    total_records: number;
  };
  providers: Array<{
    provider: string;
    data_source: string;
    category?: string;
    description?: string;
    configured?: boolean;
    requirement_note?: string;
  }>;
}

export interface StationStop {
  id?: number;
  train_id?: number;
  train_number?: string;
  station_id?: number;
  sequence: number;
  station_code: string;
  station_name: string;
  platform: string;
  distance_km: number;
  distance_from_origin?: number;
  lat: number;
  lng: number;
  latitude?: number;
  longitude?: number;
  scheduled_arrival: string;
  scheduled_departure: string;
  predicted_eta: string;
  prediction_range: string;
  delay_mins: number;
  historical_avg_delay_mins: number;
  section_scheduled_mins: number;
  section_predicted_mins: number;
  status: StopStatus;
  confidence: number;
  halt_mins?: number;
  zone_code?: string;
}

export interface TrainSummary {
  id?: number;
  train_number: string;
  train_name: string;
  train_type: 'Rajdhani' | 'Vande Bharat' | 'Shatabdi' | 'Superfast' | 'Duronto' | string;
  zone: string;
  source_code: string;
  source_name: string;
  destination_code: string;
  destination_name: string;
  running_status: string;
  current_delay_mins: number;
  current_speed_kmph: number;
  next_station_code: string;
  next_station_name: string;
  predicted_eta: string;
  prediction_range: string;
  prediction_confidence: number;
  route_count?: number;
  has_routes?: boolean;
  data_source?: DataSourceBadgeType;
  data_mode?: string;
}

export interface TrainStatus extends TrainSummary {
  max_permissible_speed_kmph: number;
  distance_covered_km: number;
  distance_remaining_km: number;
  total_distance_km: number;
  current_lat: number;
  current_lng: number;
  previous_station_code: string;
  previous_station_name: string;
  weather_condition: string;
  weather_temp_c: number;
  weather_visibility_km: number;
  congestion_level: string;
  congestion_index: number;
  historical_avg_delay_mins: number;
  last_updated: string;
  rake_type?: string;
  locomotive?: string;
  stops: StationStop[];
}

export interface PredictETARequest {
  train_number: string;
  station_code: string;
  scheduled_arrival: string;
  current_delay_mins: number;
  distance_remaining_km: number;
  current_speed_kmph: number;
  scheduled_section_speed_kmph: number;
  historical_station_delay_mins: number;
  congestion_index: number;
  weather_severity: number;
  hour_of_day: number;
  train_priority_tier: number;
  stops_remaining: number;
}

export interface PredictETAResponse {
  train_number: string;
  station_code: string;
  scheduled_arrival: string;
  predicted_eta: string;
  predicted_delay_mins: number;
  prediction_range: string;
  prediction_range_start: string;
  prediction_range_end: string;
  confidence: number;
  model_version: string;
  factors: {
    slack_recovery_mins: number;
    congestion_impact_mins: number;
    weather_impact_mins: number;
    historical_weight: number;
  };
}

export interface AnalyticsData {
  kpis: {
    network_mae_mins: number;
    prediction_accuracy_pct: number;
    active_trains_monitored: number;
    avg_recovery_saved_mins: number;
  };
  scheduled_vs_actual: Array<{
    station: string;
    scheduled_mins: number;
    actual_mins: number;
    predicted_mins: number;
  }>;
  delay_distribution: Array<{
    bucket: string;
    trains: number;
    percentage: number;
  }>;
  prediction_error_by_horizon: Array<{
    horizon: string;
    raileta_mae: number;
    legacy_ntes_mae: number;
  }>;
  average_delay_by_hour: Array<{
    hour: string;
    avg_delay: number;
    congestion: number;
  }>;
  route_performance: Array<{
    corridor: string;
    punctuality: number;
    ml_accuracy: number;
    avg_delay: number;
  }>;
  prediction_accuracy_trend: Array<{
    month: string;
    within_5m: number;
    within_10m: number;
  }>;
}

export interface TelemetryUpdate {
  type: 'TELEMETRY_UPDATE';
  train_number: string;
  current_speed_kmph: number;
  current_delay_mins: number;
  distance_covered_km: number;
  distance_remaining_km: number;
  current_lat: number;
  current_lng: number;
  predicted_eta: string;
  prediction_range: string;
  prediction_confidence: number;
  data_source?: DataSourceBadgeType;
  data_mode?: string;
  weather_condition?: string;
  congestion_level?: string;
  timestamp: string;
  playback?: {
    status: string;
    current_index: number;
    total_records: number;
    speed_multiplier: number;
    record_timestamp: string;
  };
  eta_snapshot?: {
    predictions?: Array<{
      station: { code: string };
      predicted_eta: string;
      predicted_delay: number;
      confidence: number;
      lower_bound: string;
      upper_bound: string;
    }>;
  };
}
