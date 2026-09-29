"""
Pydantic v2 Schemas for RailETA Backend API.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class LoginRequestSchema(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class UserResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    is_active: bool
    is_demo: bool = True
    account_label: str = "Demo Account"
    created_at: datetime


class TokenResponseSchema(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 86400
    user: UserResponseSchema


class DatasetValidationSummarySchema(BaseModel):
    valid: bool = True
    record_count: int = 0
    missing_values_pct: float = 0.0
    duplicate_rows: int = 0
    invalid_coordinates: int = 0
    date_range: Optional[str] = None
    columns_validated: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class DatasetItemSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    dataset_type: str
    filename: str
    row_count: int
    status: str
    source_type: str
    uploaded_by: str
    validation: DatasetValidationSummarySchema
    created_at: str
    updated_at: str


class DatasetUpdateSchema(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    source_type: Optional[str] = None


class ManualTelemetryUpdateSchema(BaseModel):
    train_number: str = Field("", description="Train number or ID")
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    speed: float = Field(..., ge=0.0, le=200.0, description="Speed in km/h")
    delay: float = Field(..., ge=-30.0, le=720.0, description="Current delay in minutes")
    congestion: str = Field("Low", description="Low, Moderate, High, or Severe")
    weather: str = Field("Clear", description="Clear, Light Rain, Heavy Rain, Fog / Mist, or Storm")


class TelemetryModeUpdateSchema(BaseModel):
    data_mode: str = Field(
        ...,
        description="AUTOMATIC_SIMULATION, MANUAL_CONTROL, UPLOADED_TELEMETRY, or EXTERNAL_API",
    )


class TelemetryPlaybackControlSchema(BaseModel):
    action: str = Field(..., description="start, pause, resume, stop, step, or reset")
    train_number: str = Field("")
    speed_multiplier: float = Field(1.0, description="1, 2, 5, or 10")
    dataset_id: Optional[int] = Field(None)


class StationBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    code: str
    name: str
    latitude: float
    longitude: float
    sequence: Optional[int] = None
    distance_from_origin: Optional[float] = None
    platform: Optional[str] = "1"


class RouteStopSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    train_id: Optional[int] = None
    train_number: Optional[str] = None
    station_id: Optional[int] = None
    sequence: int
    station_code: str
    station_name: str
    platform: str
    distance_km: float
    distance_from_origin: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    lat: float
    lng: float
    scheduled_arrival: str
    scheduled_departure: str
    predicted_eta: str
    prediction_range: str
    lower_bound: str
    upper_bound: str
    delay_mins: int
    historical_avg_delay_mins: float
    section_scheduled_mins: int
    section_predicted_mins: int
    status: str
    confidence: int
    halt_mins: int = 2


class TrainSummarySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    train_number: str
    train_name: str
    train_type: str
    zone: str
    source: str
    destination: str
    source_code: str
    source_name: str
    destination_code: str
    destination_name: str
    status: str
    running_status: str
    current_delay_mins: int
    current_speed_kmph: float
    next_station_code: str
    next_station_name: str
    predicted_eta: str
    prediction_range: str
    prediction_confidence: int
    route_count: int = 0
    has_routes: bool = False
    data_source: str = "Uploaded Dataset"
    data_mode: str = "AUTOMATIC_SIMULATION"


class TrainStatusResponseSchema(TrainSummarySchema):
    max_permissible_speed_kmph: float
    distance_covered_km: float
    distance_remaining_km: float
    total_distance_km: float
    current_lat: float
    current_lng: float
    previous_station_code: str
    previous_station_name: str
    weather_condition: str
    weather_temp_c: float
    weather_visibility_km: float
    congestion_level: str
    congestion_index: float
    historical_avg_delay_mins: float
    rake_type: str
    locomotive: str
    last_updated: str
    stops: List[RouteStopSchema]


class CurrentPositionSchema(BaseModel):
    latitude: float
    longitude: float
    distance_covered_km: float
    distance_remaining_km: float
    previous_station_code: str
    next_station_code: str
    timestamp: str


class StationETAPredictionItemSchema(BaseModel):
    station: StationBaseSchema
    scheduled_eta: str
    predicted_eta: str
    predicted_delay: float
    confidence: float
    lower_bound: str
    upper_bound: str


class TrainETAResponseSchema(BaseModel):
    train: Dict[str, Any]
    current_position: CurrentPositionSchema
    current_speed: float
    current_delay: float
    next_station: StationBaseSchema
    predictions: List[StationETAPredictionItemSchema]
    last_updated: str
    data_source: str = "SIMULATED LIVE"
    data_mode: str = "AUTOMATIC_SIMULATION"


class PredictionRequestSchema(BaseModel):
    train_id: Optional[str] = Field("12951", description="Train number or database ID")
    train_number: Optional[str] = Field("12951", description="5-digit Indian Railways train number")
    station_code: str = Field("KOTA", description="Target station code")
    scheduled_eta: Optional[str] = Field("18:30", description="Scheduled arrival HH:MM")
    scheduled_arrival: Optional[str] = Field(None, description="Alias for scheduled_eta")
    current_delay: float = Field(12.0, ge=-15.0, le=360.0)
    current_delay_mins: Optional[float] = Field(None)
    current_speed: float = Field(118.0, ge=0.0, le=180.0)
    current_speed_kmph: Optional[float] = Field(None)
    distance_to_next_station: float = Field(65.0, ge=0.5, le=1000.0)
    distance_to_destination: float = Field(267.0, ge=1.0, le=3000.0)
    distance_remaining_km: Optional[float] = Field(None)
    historical_section_running_time: float = Field(165.0, ge=5.0, le=1200.0)
    historical_average_delay: float = Field(11.0, ge=0.0, le=240.0)
    historical_station_delay_mins: Optional[float] = Field(None)
    route_sequence: int = Field(6, ge=1, le=40)
    day_of_week: int = Field(1, ge=0, le=6)
    hour: int = Field(18, ge=0, le=23)
    hour_of_day: Optional[int] = Field(None)
    weather: float = Field(0.10, ge=0.0, le=1.0)
    weather_severity: Optional[float] = Field(None)
    congestion: float = Field(0.28, ge=0.0, le=1.0)
    congestion_index: Optional[float] = Field(None)
    previous_station_delay: float = Field(15.0, ge=-15.0, le=360.0)


class PredictionResponseSchema(BaseModel):
    train_number: str
    station_code: str
    scheduled_eta: str
    scheduled_arrival: str
    baseline_eta: str
    baseline_delay: float
    predicted_eta: str
    predicted_delay: float
    predicted_delay_mins: int
    lower_bound: str
    upper_bound: str
    prediction_range: str
    prediction_range_start: str
    prediction_range_end: str
    confidence: int
    remaining_travel_time_mins: float
    model_version: str
    data_source: str
    factors: Dict[str, float]
