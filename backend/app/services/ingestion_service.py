"""
Data Ingestion & Idempotent Seeding Service for RailETA.
--------------------------------------------------------
Responsible for:
1. Idempotently seeding:
   - Default Demo Account (`users`)
   - System operational mode (`system_states`)
   - Railway network tables (`stations`, `trains`, `routes`, `train_positions`, `predictions`, `historical_runs`)
   - Weather & Telemetry playback records (`weather_records`, `telemetry_records`)
   - Persistent Data Center catalog (`datasets`) labeled as "Synthetic Demo Data"
2. Ingesting live, manual, or uploaded telemetry updates into `train_positions`
   and persisting the updated state in PostgreSQL.
"""

from datetime import datetime, timedelta
import json
import os
from typing import Any, Dict, Optional
import numpy as np
from sqlalchemy.orm import Session

from app.models.railway import (
    Dataset,
    HistoricalRun,
    Prediction,
    Route,
    Station,
    TelemetryRecord,
    Train,
    TrainPosition,
    WeatherRecord,
)
from app.services.auth_service import get_demo_credentials, seed_demo_user_if_needed
from app.services.data_generator import (
    DETERMINISTIC_SEED,
    STATIONS_CATALOG,
    TRAINS_CATALOG,
    generate_historical_training_dataframe,
)
from app.services.telemetry_providers import (
    get_or_create_system_state,
    interpolate_route_position,
)


def is_seed_demo_data_enabled() -> bool:
    """Returns True ONLY if SEED_DEMO_DATA is explicitly set to true/1/yes."""
    return os.getenv("SEED_DEMO_DATA", "false").strip().lower() in ("true", "1", "yes")


def seed_all_tables_if_empty(db: Session, force_demo_seed: bool = False) -> Dict[str, Any]:
    """
    Idempotently initializes the database:
    1. Creates the default Demo Account (`demo` / `RailETA-Demo-2026`) if it doesn't exist.
    2. Creates the default SystemState if it doesn't exist.
    3. Leaves all railway operational tables (`trains`, `stations`, `routes`, `historical_runs`,
       `weather_records`, `telemetry_records`, `train_positions`, `predictions`, `datasets`)
       completely EMPTY unless `SEED_DEMO_DATA=true` is explicitly configured for development.
    4. Never overwrites user-uploaded data or duplicates the demo user.
    """
    # 1. Always ensure Demo User and SystemState exist idempotently
    demo_user = seed_demo_user_if_needed(db)
    get_or_create_system_state(db)

    if not force_demo_seed and not is_seed_demo_data_enabled():
        return {
            "demo_user_ready": True,
            "demo_username": demo_user.username,
            "seeded_railway_data": False,
        }

    # 2. Optional development-only synthetic seeding (only when SEED_DEMO_DATA=true)
    if db.query(Train).count() == 0:
        station_map: Dict[str, Station] = {}
        for code, meta in STATIONS_CATALOG.items():
            existing_st = db.query(Station).filter(Station.code == code).first()
            if existing_st:
                station_map[code] = existing_st
                continue
            st_obj = Station(
                code=code,
                name=meta["name"],
                latitude=float(meta["lat"]),
                longitude=float(meta["lng"]),
                zone=meta["zone"],
            )
            db.add(st_obj)
            db.flush()
            station_map[code] = st_obj

        now = datetime.utcnow()
        for t_meta in TRAINS_CATALOG:
            src_code = t_meta["source"]
            dst_code = t_meta["destination"]
            train_obj = Train(
                train_number=t_meta["train_number"],
                train_name=t_meta["train_name"],
                source=src_code,
                destination=dst_code,
                status=t_meta["status"],
                train_type=t_meta["train_type"],
                zone=t_meta["zone"],
                source_name=STATIONS_CATALOG[src_code]["name"],
                destination_name=STATIONS_CATALOG[dst_code]["name"],
                max_permissible_speed_kmph=float(t_meta["max_permissible_speed_kmph"]),
                total_distance_km=float(t_meta["total_distance_km"]),
                rake_type=t_meta["rake_type"],
                locomotive=t_meta["locomotive"],
            )
            db.add(train_obj)
            db.flush()

            for stop in t_meta["route_stops"]:
                st = station_map[stop["code"]]
                route_obj = Route(
                    train_id=train_obj.id,
                    station_id=st.id,
                    sequence=int(stop["seq"]),
                    scheduled_arrival=stop["arr"],
                    scheduled_departure=stop["dep"],
                    distance_from_origin=float(stop["dist"]),
                    platform=stop["pf"],
                    halt_mins=int(stop["halt"]),
                    scheduled_section_running_time_mins=float(stop["sec_mins"]),
                    historical_avg_delay_mins=float(stop["hist_delay"]),
                )
                db.add(route_obj)

                pred_delta = (
                    0
                    if stop["status"] == "Departed"
                    else max(-2, int(stop["delay"]) - int(stop["hist_delay"]))
                )
                sec_pred = (
                    max(0, int(stop["sec_mins"]) + pred_delta)
                    if int(stop["sec_mins"]) > 0
                    else 0
                )

                pred_obj = Prediction(
                    train_id=train_obj.id,
                    station_id=st.id,
                    prediction_time=now,
                    predicted_eta=stop["eta"],
                    scheduled_eta=stop["arr"],
                    predicted_delay=float(stop["delay"]),
                    confidence=float(stop["conf"]),
                    lower_bound=stop["low"],
                    upper_bound=stop["high"],
                    section_predicted_mins=sec_pred,
                    stop_status=stop["status"],
                )
                db.add(pred_obj)

            db.flush()
            db.refresh(train_obj)

            # Use exact route interpolation for initial train position
            pos_meta = t_meta["initial_position"]
            interp = interpolate_route_position(
                train_obj, float(pos_meta["distance_covered_km"])
            )
            pos_obj = TrainPosition(
                train_id=train_obj.id,
                timestamp=now,
                latitude=float(interp["latitude"]),
                longitude=float(interp["longitude"]),
                speed=float(pos_meta["speed"]),
                delay_minutes=float(pos_meta["delay_minutes"]),
                distance_covered_km=float(interp["distance_covered_km"]),
                distance_remaining_km=float(interp["distance_remaining_km"]),
                previous_station_code=interp["previous_station_code"],
                next_station_code=interp["next_station_code"],
                weather_condition=pos_meta["weather_condition"],
                weather_severity=float(pos_meta["weather_severity"]),
                weather_temp_c=float(pos_meta["weather_temp_c"]),
                weather_visibility_km=float(pos_meta["weather_visibility_km"]),
                congestion_level=pos_meta["congestion_level"],
                congestion_index=float(pos_meta["congestion_index"]),
                data_source="SIMULATED LIVE",
            )
            db.add(pos_obj)

        db.flush()

        # 3. Seed Historical Runs (deterministic seed=42)
        train_id_by_no = {t.train_number: t.id for t in db.query(Train).all()}
        station_by_code = {s.code: s for s in db.query(Station).all()}
        hist_df = generate_historical_training_dataframe(
            n_days=30, samples_per_day=12, seed=DETERMINISTIC_SEED
        )
        for _, row in hist_df.iterrows():
            t_id = train_id_by_no.get(str(row["train"]))
            st_obj = station_by_code.get(str(row["station"]))
            if not t_id or not st_obj:
                continue
            hr = HistoricalRun(
                train_id=t_id,
                station_id=st_obj.id,
                date=str(row["date"]),
                scheduled_arrival=str(row["scheduled_arrival"]),
                actual_arrival=str(row["actual_arrival"]),
                delay_minutes=float(row["actual_arrival_delay"]),
                running_time=float(row["remaining_travel_time"]),
                current_delay=float(row["current_delay"]),
                current_speed=float(row["current_speed"]),
                distance_to_next_station=float(row["distance_to_next_station"]),
                distance_to_destination=float(row["distance_to_destination"]),
                historical_section_running_time=float(row["historical_section_running_time"]),
                historical_average_delay=float(row["historical_average_delay"]),
                sequence=int(row["sequence"]),
                day_of_week=int(row["day_of_week"]),
                hour=int(row["hour"]),
                weather=float(row["weather"]),
                congestion=float(row["congestion"]),
                previous_station_delay=float(row["previous_station_delay"]),
            )
            db.add(hr)
        db.commit()

    # 4. Seed Weather Records idempotently if empty
    if db.query(WeatherRecord).count() == 0:
        rng = np.random.default_rng(DETERMINISTIC_SEED)
        base_time = datetime(2026, 9, 1, 6, 0, 0)
        conditions = ["Clear", "Clear", "Light Haze", "Light Rain", "Fog / Mist"]
        st_items = list(STATIONS_CATALOG.values())
        for idx in range(60):
            st_meta = st_items[idx % len(st_items)]
            cond = str(conditions[int(rng.integers(0, len(conditions)))])
            rain = 4.2 if "Rain" in cond else 0.0
            vis = 3.5 if "Fog" in cond else (6.5 if "Rain" in cond else 9.5)
            db.add(
                WeatherRecord(
                    timestamp=(base_time + timedelta(hours=idx * 4)).strftime(
                        "%Y-%m-%d %H:%M:%S"
                    ),
                    latitude=float(st_meta["lat"]),
                    longitude=float(st_meta["lng"]),
                    temperature=round(float(rng.uniform(21.0, 33.5)), 1),
                    rainfall=rain,
                    visibility=vis,
                    wind_speed=round(float(rng.uniform(6.0, 24.0)), 1),
                    condition=cond,
                )
            )
        db.commit()

    # 5. Seed Telemetry Playback Records idempotently if empty
    if db.query(TelemetryRecord).count() == 0:
        train_12951 = db.query(Train).filter(Train.train_number == "12951").first()
        if train_12951:
            base_ts = datetime(2026, 9, 28, 17, 30, 0)
            # Generate 30 deterministic route-interpolated telemetry steps from RTM (653 km) toward NDLS (1384 km)
            distances = np.linspace(680.0, 1220.0, 30)
            for idx, dist_km in enumerate(distances):
                interp = interpolate_route_position(train_12951, float(dist_km))
                speed_val = 116.0 + float((idx % 5) * 2.5 - 4.0)
                delay_val = max(4.0, 14.0 - round(idx * 0.25, 1))
                weather_str = "Clear" if idx < 18 else "Light Haze"
                cong_str = "Low" if idx % 3 != 0 else "Moderate"
                db.add(
                    TelemetryRecord(
                        sequence_index=idx + 1,
                        timestamp=(base_ts + timedelta(minutes=idx * 8)).strftime(
                            "%Y-%m-%d %H:%M:%S"
                        ),
                        train_number="12951",
                        latitude=float(interp["latitude"]),
                        longitude=float(interp["longitude"]),
                        speed=round(speed_val, 1),
                        delay=round(delay_val, 1),
                        weather=weather_str,
                        congestion=cong_str,
                    )
                )
            db.commit()

    # 6. Seed Dataset Catalog entries idempotently if empty
    if db.query(Dataset).count() == 0:
        demo_username, _ = get_demo_credentials()
        hist_count = db.query(HistoricalRun).count()
        train_count = db.query(Train).count()
        station_count = db.query(Station).count()
        route_count = db.query(Route).count()
        weather_count = db.query(WeatherRecord).count()
        telemetry_count = db.query(TelemetryRecord).count()

        seed_datasets = [
            (
                "Historical Runs",
                "historical_runs",
                "historical_runs.csv",
                hist_count,
                {
                    "valid": True,
                    "record_count": hist_count,
                    "missing_values_pct": 0.0,
                    "duplicate_rows": 0,
                    "invalid_coordinates": 0,
                    "date_range": "2026-06-01 → 2026-06-30",
                    "columns_validated": [
                        "train_number",
                        "station_code",
                        "date",
                        "scheduled_arrival",
                        "actual_arrival",
                        "delay",
                        "speed",
                        "running_time",
                    ],
                    "notes": "Synthetic Demo Data (seed=42) — Preloaded historical arrivals & section running times",
                },
            ),
            (
                "Train Data",
                "trains",
                "trains.csv",
                train_count,
                {
                    "valid": True,
                    "record_count": train_count,
                    "missing_values_pct": 0.0,
                    "duplicate_rows": 0,
                    "invalid_coordinates": 0,
                    "date_range": "Active Timetable 2026",
                    "columns_validated": [
                        "train_number",
                        "train_name",
                        "source",
                        "destination",
                        "train_type",
                        "max_permissible_speed_kmph",
                    ],
                    "notes": "Synthetic Demo Data — 6 flagship corridors (Rajdhani, Vande Bharat, Shatabdi, Superfast)",
                },
            ),
            (
                "Station Data",
                "stations",
                "stations.csv",
                station_count,
                {
                    "valid": True,
                    "record_count": station_count,
                    "missing_values_pct": 0.0,
                    "duplicate_rows": 0,
                    "invalid_coordinates": 0,
                    "date_range": "Geo-verified Catalog",
                    "columns_validated": [
                        "station_code",
                        "station_name",
                        "latitude",
                        "longitude",
                    ],
                    "notes": "Synthetic Demo Data — 28 junction geo-coordinates for corridor interpolation",
                },
            ),
            (
                "Route Data",
                "routes",
                "routes.csv",
                route_count,
                {
                    "valid": True,
                    "record_count": route_count,
                    "missing_values_pct": 0.0,
                    "duplicate_rows": 0,
                    "invalid_coordinates": 0,
                    "date_range": "Active Corridor Sequences",
                    "columns_validated": [
                        "train_number",
                        "sequence",
                        "station_code",
                        "distance_km",
                    ],
                    "notes": "Synthetic Demo Data — Ordered station sequences and cumulative route distances",
                },
            ),
            (
                "Weather Data",
                "weather",
                "weather.csv",
                weather_count,
                {
                    "valid": True,
                    "record_count": weather_count,
                    "missing_values_pct": 0.0,
                    "duplicate_rows": 0,
                    "invalid_coordinates": 0,
                    "date_range": "2026-09-01 → 2026-09-11",
                    "columns_validated": [
                        "timestamp",
                        "latitude",
                        "longitude",
                        "temperature",
                        "rainfall",
                        "visibility",
                        "wind_speed",
                        "condition",
                    ],
                    "notes": "Synthetic Demo Data — Corridor meteorological telemetry",
                },
            ),
            (
                "Telemetry Data",
                "telemetry",
                "telemetry_12951.csv",
                telemetry_count,
                {
                    "valid": True,
                    "record_count": telemetry_count,
                    "missing_values_pct": 0.0,
                    "duplicate_rows": 0,
                    "invalid_coordinates": 0,
                    "date_range": "2026-09-28 17:30 → 2026-09-28 21:22",
                    "columns_validated": [
                        "timestamp",
                        "train_number",
                        "latitude",
                        "longitude",
                        "speed",
                        "delay",
                        "weather",
                        "congestion",
                    ],
                    "notes": "Synthetic Demo Data — Route-interpolated GPS playback sequence for #12951",
                },
            ),
        ]

        now = datetime.utcnow()
        for name, dtype, fname, rcount, vsummary in seed_datasets:
            db.add(
                Dataset(
                    name=name,
                    dataset_type=dtype,
                    filename=fname,
                    row_count=rcount,
                    status="Ready",
                    source_type="Synthetic Demo Data",
                    uploaded_by=demo_username,
                    validation_summary=json.dumps(vsummary),
                    created_at=now,
                    updated_at=now,
                )
            )
        db.commit()

    return {
        "demo_user_ready": True,
        "demo_username": demo_user.username,
        "seeded_railway_data": True,
    }


def ingest_live_telemetry(
    db: Session,
    train: Train,
    latitude: float,
    longitude: float,
    speed: float,
    delay_minutes: float,
    distance_covered_km: Optional[float] = None,
    previous_station_code: Optional[str] = None,
    next_station_code: Optional[str] = None,
    weather_condition: Optional[str] = None,
    weather_severity: Optional[float] = None,
    weather_temp_c: Optional[float] = None,
    weather_visibility_km: Optional[float] = None,
    congestion_level: Optional[str] = None,
    congestion_index: Optional[float] = None,
    data_source: str = "SIMULATED LIVE",
) -> TrainPosition:
    """
    Ingests a new GPS/telemetry update for `train` and persists the latest state
    in PostgreSQL `train_positions`.
    """
    latest = train.positions[0] if train.positions else None

    covered = (
        distance_covered_km
        if distance_covered_km is not None
        else (latest.distance_covered_km if latest else 0.0)
    )
    remaining = max(0.0, float(train.total_distance_km) - float(covered))

    new_pos = TrainPosition(
        train_id=train.id,
        timestamp=datetime.utcnow(),
        latitude=round(float(latitude), 5),
        longitude=round(float(longitude), 5),
        speed=round(float(speed), 1),
        delay_minutes=round(float(delay_minutes), 1),
        distance_covered_km=round(float(covered), 1),
        distance_remaining_km=round(remaining, 1),
        previous_station_code=(
            previous_station_code
            if previous_station_code is not None
            else (latest.previous_station_code if latest else train.source)
        ),
        next_station_code=(
            next_station_code
            if next_station_code is not None
            else (latest.next_station_code if latest else train.destination)
        ),
        weather_condition=(
            weather_condition
            if weather_condition is not None
            else (latest.weather_condition if latest else "Clear Sky")
        ),
        weather_severity=(
            float(weather_severity)
            if weather_severity is not None
            else (float(latest.weather_severity) if latest else 0.1)
        ),
        weather_temp_c=(
            float(weather_temp_c)
            if weather_temp_c is not None
            else (float(latest.weather_temp_c) if latest else 28.5)
        ),
        weather_visibility_km=(
            float(weather_visibility_km)
            if weather_visibility_km is not None
            else (float(latest.weather_visibility_km) if latest else 9.0)
        ),
        congestion_level=(
            congestion_level
            if congestion_level is not None
            else (latest.congestion_level if latest else "Moderate")
        ),
        congestion_index=(
            float(congestion_index)
            if congestion_index is not None
            else (float(latest.congestion_index) if latest else 0.25)
        ),
        data_source=data_source,
    )
    db.add(new_pos)

    delay_int = int(round(float(delay_minutes)))
    train.status = "On Time" if delay_int <= 2 else f"Running Late by {delay_int}m"
    db.commit()
    db.refresh(new_pos)
    db.refresh(train)
    return new_pos
