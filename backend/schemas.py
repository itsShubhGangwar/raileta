"""
Pydantic Schemas for RailETA FastAPI Backend
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class StationStopSchema(BaseModel):
    sequence: int
    station_code: str
    station_name: str
    platform: str
    distance_km: float
    lat: float
    lng: float
    scheduled_arrival: str
    scheduled_departure: str
    predicted_eta: str
    prediction_range: str
    delay_mins: int
    historical_avg_delay_mins: float
    section_scheduled_mins: int
    section_predicted_mins: int
    status: str
    confidence: int

    class Config:
        from_attributes = True


class TrainSummarySchema(BaseModel):
    train_number: str
    train_name: str
    train_type: str
    zone: str
    source_code: str
    source_name: str
    destination_code: str
    destination_name: str
    running_status: str
    current_delay_mins: int
    current_speed_kmph: float
    next_station_code: str
    next_station_name: str
    predicted_eta: str
    prediction_range: str
    prediction_confidence: int

    class Config:
        from_attributes = True


class TrainStatusSchema(TrainSummarySchema):
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
    last_updated: str
    stops: List[StationStopSchema]


class PredictETARequest(BaseModel):
    train_number: str = Field(..., example="12951")
    station_code: str = Field(..., example="KOTA")
    scheduled_arrival: str = Field(..., example="18:30")
    current_delay_mins: float = Field(14.0, ge=-10.0, le=300.0)
    distance_remaining_km: float = Field(142.0, ge=1.0, le=2500.0)
    current_speed_kmph: float = Field(112.0, ge=0.0, le=160.0)
    scheduled_section_speed_kmph: float = Field(98.0, ge=20.0, le=160.0)
    historical_station_delay_mins: float = Field(11.0, ge=0.0, le=180.0)
    congestion_index: float = Field(0.24, ge=0.0, le=1.0)
    weather_severity: float = Field(0.10, ge=0.0, le=1.0)
    hour_of_day: int = Field(18, ge=0, le=23)
    train_priority_tier: int = Field(1, ge=1, le=3)
    stops_remaining: int = Field(2, ge=0, le=30)


class PredictETAResponse(BaseModel):
    train_number: str
    station_code: str
    scheduled_arrival: str
    predicted_eta: str
    predicted_delay_mins: int
    prediction_range: str
    prediction_range_start: str
    prediction_range_end: str
    confidence: int
    model_version: str
    factors: Dict[str, float]
