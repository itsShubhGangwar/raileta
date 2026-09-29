"""
SQLAlchemy ORM Models for RailETA PostgreSQL Database
"""

from datetime import datetime
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, JSON
from sqlalchemy.orm import relationship
from database import Base


class Train(Base):
    __tablename__ = "trains"

    id = Column(Integer, primary_key=True, index=True)
    train_number = Column(String(12), unique=True, index=True, nullable=False)
    train_name = Column(String(120), nullable=False)
    train_type = Column(String(40), nullable=False)
    zone = Column(String(20), nullable=False)
    source_code = Column(String(10), nullable=False)
    source_name = Column(String(100), nullable=False)
    destination_code = Column(String(10), nullable=False)
    destination_name = Column(String(100), nullable=False)
    running_status = Column(String(40), nullable=False)
    current_delay_mins = Column(Integer, default=0)
    current_speed_kmph = Column(Float, default=0.0)
    max_permissible_speed_kmph = Column(Float, default=130.0)
    distance_covered_km = Column(Float, default=0.0)
    distance_remaining_km = Column(Float, default=0.0)
    total_distance_km = Column(Float, default=0.0)
    current_lat = Column(Float, nullable=False)
    current_lng = Column(Float, nullable=False)
    previous_station_code = Column(String(10), nullable=False)
    previous_station_name = Column(String(100), nullable=False)
    next_station_code = Column(String(10), nullable=False)
    next_station_name = Column(String(100), nullable=False)
    predicted_eta = Column(String(16), nullable=False)
    prediction_range = Column(String(32), nullable=False)
    prediction_confidence = Column(Integer, default=85)
    weather_condition = Column(String(80), default="Clear Sky")
    weather_temp_c = Column(Float, default=29.0)
    weather_visibility_km = Column(Float, default=8.5)
    congestion_level = Column(String(40), default="Moderate")
    congestion_index = Column(Float, default=0.28)
    historical_avg_delay_mins = Column(Float, default=9.0)
    last_updated = Column(DateTime, default=datetime.utcnow)

    stops = relationship("StationStop", back_populates="train", cascade="all, delete-orphan")


class StationStop(Base):
    __tablename__ = "station_stops"

    id = Column(Integer, primary_key=True, index=True)
    train_id = Column(Integer, ForeignKey("trains.id"), nullable=False)
    sequence = Column(Integer, nullable=False)
    station_code = Column(String(12), nullable=False)
    station_name = Column(String(120), nullable=False)
    platform = Column(String(12), default="1")
    distance_km = Column(Float, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    scheduled_arrival = Column(String(12), nullable=False)
    scheduled_departure = Column(String(12), nullable=False)
    predicted_eta = Column(String(12), nullable=False)
    prediction_range = Column(String(32), nullable=False)
    delay_mins = Column(Integer, default=0)
    historical_avg_delay_mins = Column(Float, default=5.0)
    section_scheduled_mins = Column(Integer, default=45)
    section_predicted_mins = Column(Integer, default=48)
    status = Column(String(32), nullable=False)  # Departed | Current | Approaching | Upcoming
    confidence = Column(Integer, default=85)

    train = relationship("Train", back_populates="stops")


class PredictionAuditLog(Base):
    __tablename__ = "prediction_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    train_number = Column(String(12), index=True, nullable=False)
    station_code = Column(String(12), nullable=False)
    scheduled_arrival = Column(String(12), nullable=False)
    predicted_eta = Column(String(12), nullable=False)
    prediction_range = Column(String(32), nullable=False)
    confidence = Column(Integer, nullable=False)
    features_payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
