"""
SQLAlchemy ORM Models for RailETA Database.
Defines persistent PostgreSQL tables:
- users (authentication & demo account)
- datasets (Data Center dataset catalog & validation summaries)
- trains
- stations
- routes
- train_positions (live, manual, and playback telemetry state)
- predictions (ML ETA point + P10/P90 quantile bounds)
- historical_runs (labeled historical section & arrival runs)
- weather_records (corridor meteorological records)
- telemetry_records (uploaded/seeded CSV telemetry sequences for playback)
- system_states (persistent data mode & playback state across restarts)
"""

from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    email = Column(String(140), unique=True, index=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(140), nullable=False)
    dataset_type = Column(String(48), index=True, nullable=False)
    filename = Column(String(160), nullable=False)
    row_count = Column(Integer, nullable=False, default=0)
    status = Column(String(32), nullable=False, default="Ready")
    source_type = Column(String(80), nullable=False, default="Synthetic Demo Data")
    uploaded_by = Column(String(64), nullable=False, default="demo")
    validation_summary = Column(Text, nullable=True, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class WeatherRecord(Base):
    __tablename__ = "weather_records"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), index=True, nullable=True)
    timestamp = Column(String(40), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    temperature = Column(Float, nullable=False, default=28.0)
    rainfall = Column(Float, nullable=False, default=0.0)
    visibility = Column(Float, nullable=False, default=9.0)
    wind_speed = Column(Float, nullable=False, default=12.0)
    condition = Column(String(64), nullable=False, default="Clear")


class TelemetryRecord(Base):
    __tablename__ = "telemetry_records"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), index=True, nullable=True)
    sequence_index = Column(Integer, nullable=False, default=0, index=True)
    timestamp = Column(String(40), nullable=False)
    train_number = Column(String(16), index=True, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    speed = Column(Float, nullable=False, default=90.0)
    delay = Column(Float, nullable=False, default=0.0)
    weather = Column(String(64), nullable=False, default="Clear")
    congestion = Column(String(64), nullable=False, default="Low")


class SystemState(Base):
    __tablename__ = "system_states"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(64), unique=True, index=True, nullable=False, default="global")
    data_mode = Column(String(48), nullable=False, default="AUTOMATIC_SIMULATION")
    active_data_source = Column(String(48), nullable=False, default="SIMULATED LIVE")
    playback_status = Column(String(32), nullable=False, default="STOPPED")
    playback_speed = Column(Float, nullable=False, default=1.0)
    playback_train_number = Column(String(16), nullable=False, default="12951")
    playback_index = Column(Integer, nullable=False, default=0)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class Train(Base):
    __tablename__ = "trains"

    id = Column(Integer, primary_key=True, index=True)
    train_number = Column(String(16), unique=True, index=True, nullable=False)
    train_name = Column(String(140), nullable=False)
    source = Column(String(16), nullable=False)
    destination = Column(String(16), nullable=False)
    status = Column(String(64), nullable=False, default="On Time")

    # Extended operational metadata for UI & ML context
    train_type = Column(String(40), nullable=False, default="Superfast")
    zone = Column(String(40), nullable=False, default="NR / Northern Railway")
    source_name = Column(String(100), nullable=False, default="")
    destination_name = Column(String(100), nullable=False, default="")
    max_permissible_speed_kmph = Column(Float, default=130.0)
    total_distance_km = Column(Float, default=1000.0)
    rake_type = Column(String(80), default="LHB Express Rake (22 Coaches)")
    locomotive = Column(String(80), default="WAP-7 Electric Locomotive")

    routes = relationship(
        "Route",
        back_populates="train",
        cascade="all, delete-orphan",
        order_by="Route.sequence",
    )
    positions = relationship(
        "TrainPosition",
        back_populates="train",
        cascade="all, delete-orphan",
        order_by="TrainPosition.timestamp.desc(), TrainPosition.id.desc()",
    )
    predictions = relationship(
        "Prediction",
        back_populates="train",
        cascade="all, delete-orphan",
    )
    historical_runs = relationship(
        "HistoricalRun",
        back_populates="train",
        cascade="all, delete-orphan",
    )


class Station(Base):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(16), unique=True, index=True, nullable=False)
    name = Column(String(120), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    zone = Column(String(32), default="IR")

    routes = relationship("Route", back_populates="station")
    predictions = relationship("Prediction", back_populates="station")
    historical_runs = relationship("HistoricalRun", back_populates="station")


class Route(Base):
    __tablename__ = "routes"

    id = Column(Integer, primary_key=True, index=True)
    train_id = Column(Integer, ForeignKey("trains.id"), index=True, nullable=False)
    station_id = Column(Integer, ForeignKey("stations.id"), index=True, nullable=False)
    sequence = Column(Integer, nullable=False)
    scheduled_arrival = Column(String(16), nullable=False)
    scheduled_departure = Column(String(16), nullable=False)
    distance_from_origin = Column(Float, nullable=False)

    # Operational route attributes
    platform = Column(String(12), default="1")
    halt_mins = Column(Integer, default=2)
    scheduled_section_running_time_mins = Column(Float, default=45.0)
    historical_avg_delay_mins = Column(Float, default=6.0)

    train = relationship("Train", back_populates="routes")
    station = relationship("Station", back_populates="routes")


class TrainPosition(Base):
    __tablename__ = "train_positions"

    id = Column(Integer, primary_key=True, index=True)
    train_id = Column(Integer, ForeignKey("trains.id"), index=True, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    speed = Column(Float, nullable=False, default=0.0)
    delay_minutes = Column(Float, nullable=False, default=0.0)

    # Extended live telemetry context
    distance_covered_km = Column(Float, default=0.0)
    distance_remaining_km = Column(Float, default=0.0)
    previous_station_code = Column(String(16), default="")
    next_station_code = Column(String(16), default="")
    weather_condition = Column(String(64), default="Clear Sky")
    weather_severity = Column(Float, default=0.1)
    weather_temp_c = Column(Float, default=28.5)
    weather_visibility_km = Column(Float, default=9.2)
    congestion_level = Column(String(64), default="Moderate")
    congestion_index = Column(Float, default=0.25)
    data_source = Column(String(48), default="SIMULATED LIVE")

    train = relationship("Train", back_populates="positions")


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    train_id = Column(Integer, ForeignKey("trains.id"), index=True, nullable=False)
    station_id = Column(Integer, ForeignKey("stations.id"), index=True, nullable=False)
    prediction_time = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    predicted_eta = Column(String(16), nullable=False)
    scheduled_eta = Column(String(16), nullable=False)
    predicted_delay = Column(Float, nullable=False, default=0.0)
    confidence = Column(Float, nullable=False, default=84.0)

    # Prediction interval & section metadata
    lower_bound = Column(String(16), default="")
    upper_bound = Column(String(16), default="")
    section_predicted_mins = Column(Integer, default=45)
    stop_status = Column(String(32), default="Upcoming")

    train = relationship("Train", back_populates="predictions")
    station = relationship("Station", back_populates="predictions")


class HistoricalRun(Base):
    __tablename__ = "historical_runs"

    id = Column(Integer, primary_key=True, index=True)
    train_id = Column(Integer, ForeignKey("trains.id"), index=True, nullable=False)
    station_id = Column(Integer, ForeignKey("stations.id"), index=True, nullable=False)
    date = Column(String(16), index=True, nullable=False)  # YYYY-MM-DD for time-based split
    scheduled_arrival = Column(String(16), nullable=False)
    actual_arrival = Column(String(16), nullable=False)
    delay_minutes = Column(Float, nullable=False)
    running_time = Column(Float, nullable=False)

    # Telemetry snapshot features captured at prediction horizon for ML training
    current_delay = Column(Float, default=0.0)
    current_speed = Column(Float, default=90.0)
    distance_to_next_station = Column(Float, default=50.0)
    distance_to_destination = Column(Float, default=300.0)
    historical_section_running_time = Column(Float, default=60.0)
    historical_average_delay = Column(Float, default=8.0)
    sequence = Column(Integer, default=2)
    day_of_week = Column(Integer, default=1)
    hour = Column(Integer, default=14)
    weather = Column(Float, default=0.1)
    congestion = Column(Float, default=0.25)
    previous_station_delay = Column(Float, default=0.0)

    train = relationship("Train", back_populates="historical_runs")
    station = relationship("Station", back_populates="historical_runs")
