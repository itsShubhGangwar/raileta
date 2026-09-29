"""
Dataset Validation, Persistent Relational Storage, and CSV Template Service (`backend/app/services/dataset_service.py`).
------------------------------------------------------------------------------------------------------------------------
Handles:
1. Validating uploaded CSV files (required columns, numeric types, lat/lng coordinate ranges,
   missing values percentage, duplicate row detection, date range extraction).
2. Storing validated records transactionally in PostgreSQL relational tables:
   - `historical_runs`
   - `trains`
   - `stations`
   - `routes`
   - `weather_records`
   - `telemetry_records`
3. Storing dataset catalog metadata & validation summaries in `datasets`.
4. Generating downloadable CSV templates labeled as "Synthetic Demo Dataset".
"""

from datetime import datetime
import io
import json
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException
import pandas as pd
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
from app.services.telemetry_providers import (
    parse_congestion_descriptor,
    parse_weather_Descriptor,
)

DATASET_TYPE_META: Dict[str, Dict[str, Any]] = {
    "historical_runs": {
        "display_name": "Historical Runs",
        "default_filename": "historical_runs.csv",
        "required_columns": [
            "train_number",
            "station_code",
            "date",
            "scheduled_arrival",
            "actual_arrival",
            "delay",
            "speed",
            "running_time",
        ],
        "numeric_columns": ["delay", "speed", "running_time"],
        "coord_columns": [],
    },
    "trains": {
        "display_name": "Train Data",
        "default_filename": "trains.csv",
        "required_columns": [
            "train_number",
            "train_name",
            "source",
            "destination",
        ],
        "numeric_columns": [],
        "coord_columns": [],
    },
    "stations": {
        "display_name": "Station Data",
        "default_filename": "stations.csv",
        "required_columns": [
            "station_code",
            "station_name",
            "latitude",
            "longitude",
        ],
        "numeric_columns": ["latitude", "longitude"],
        "coord_columns": ["latitude", "longitude"],
    },
    "routes": {
        "display_name": "Route Data",
        "default_filename": "routes.csv",
        "required_columns": [
            "train_number",
            "sequence",
            "station_code",
            "distance_km",
        ],
        "numeric_columns": ["sequence", "distance_km"],
        "coord_columns": [],
    },
    "weather": {
        "display_name": "Weather Data",
        "default_filename": "weather.csv",
        "required_columns": [
            "timestamp",
            "latitude",
            "longitude",
            "temperature",
            "rainfall",
            "visibility",
            "wind_speed",
            "condition",
        ],
        "numeric_columns": [
            "latitude",
            "longitude",
            "temperature",
            "rainfall",
            "visibility",
            "wind_speed",
        ],
        "coord_columns": ["latitude", "longitude"],
    },
    "telemetry": {
        "display_name": "Telemetry Data",
        "default_filename": "telemetry.csv",
        "required_columns": [
            "timestamp",
            "train_number",
            "latitude",
            "longitude",
            "speed",
            "delay",
            "weather",
            "congestion",
        ],
        "numeric_columns": ["latitude", "longitude", "speed", "delay"],
        "coord_columns": ["latitude", "longitude"],
    },
}

COLUMN_ALIASES: Dict[str, Dict[str, str]] = {
    "historical_runs": {
        "train": "train_number",
        "train_id": "train_number",
        "station": "station_code",
        "station_id": "station_code",
        "code": "station_code",
        "delay_minutes": "delay",
        "actual_arrival_delay": "delay",
        "current_speed": "speed",
        "remaining_travel_time": "running_time",
    },
    "stations": {
        "code": "station_code",
        "station_id": "station_code",
        "id": "station_code",
        "name": "station_name",
        "lat": "latitude",
        "lng": "longitude",
        "lon": "longitude",
        "long": "longitude",
    },
    "routes": {
        "train_id": "train_number",
        "train": "train_number",
        "station_id": "station_code",
        "station": "station_code",
        "code": "station_code",
        "distance_from_origin": "distance_km",
        "distance": "distance_km",
        "dist": "distance_km",
        "seq": "sequence",
        "stop_sequence": "sequence",
        "order": "sequence",
    },
    "telemetry": {
        "train_id": "train_number",
        "train": "train_number",
        "delay_minutes": "delay",
        "speed_kmph": "speed",
        "lat": "latitude",
        "lng": "longitude",
        "lon": "longitude",
    },
    "weather": {
        "lat": "latitude",
        "lng": "longitude",
        "lon": "longitude",
    },
    "trains": {
        "train_id": "train_number",
        "id": "train_number",
        "number": "train_number",
        "name": "train_name",
        "origin": "source",
        "dest": "destination",
    },
}


def serialize_dataset(ds: Dataset) -> Dict[str, Any]:
    try:
        val_obj = json.loads(ds.validation_summary or "{}")
    except Exception:
        val_obj = {}

    validation = {
        "valid": bool(val_obj.get("valid", True)),
        "record_count": int(val_obj.get("record_count", ds.row_count)),
        "missing_values_pct": float(val_obj.get("missing_values_pct", 0.0)),
        "duplicate_rows": int(val_obj.get("duplicate_rows", 0)),
        "invalid_coordinates": int(val_obj.get("invalid_coordinates", 0)),
        "date_range": val_obj.get("date_range") or "N/A",
        "columns_validated": val_obj.get("columns_validated", []),
        "notes": val_obj.get("notes") or "Validated relational dataset stored in PostgreSQL",
    }

    return {
        "id": ds.id,
        "name": ds.name,
        "dataset_type": ds.dataset_type,
        "filename": ds.filename,
        "row_count": ds.row_count,
        "status": ds.status,
        "source_type": ds.source_type,
        "uploaded_by": ds.uploaded_by,
        "validation": validation,
        "created_at": ds.created_at.strftime("%Y-%m-%d %H:%M UTC") if ds.created_at else "",
        "updated_at": ds.updated_at.strftime("%Y-%m-%d %H:%M UTC") if ds.updated_at else "",
    }


def _normalize_dataframe_columns(df: pd.DataFrame, dataset_type: str) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]
    aliases = COLUMN_ALIASES.get(dataset_type, {})
    rename_map = {}
    for alias, canonical in aliases.items():
        if alias in df.columns and canonical not in df.columns:
            rename_map[alias] = canonical
    if rename_map:
        df = df.rename(columns=rename_map)
    return df


def parse_and_validate_csv(
    raw_bytes: bytes,
    dataset_type: str,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Parses CSV bytes and validates required columns, numeric fields, coordinate ranges,
    missing values, duplicate rows, and date ranges.
    Raises HTTPException(400) with a helpful explanation if invalid.
    """
    dtype = dataset_type.strip().lower()
    if dtype not in DATASET_TYPE_META:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported dataset_type '{dataset_type}'. "
                f"Must be one of: {', '.join(DATASET_TYPE_META.keys())}."
            ),
        )

    if not raw_bytes or not raw_bytes.strip():
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty. Please provide a valid CSV file with headers and data rows.",
        )

    try:
        text_content = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text_content = raw_bytes.decode("latin-1")
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Unable to decode file as CSV text: {exc}",
            )

    try:
        df = pd.read_csv(io.StringIO(text_content))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Malformed CSV syntax: {exc}",
        )

    if df.empty or len(df.columns) <= 1:
        raise HTTPException(
            status_code=400,
            detail="Malformed or empty CSV: no valid comma-separated columns or data rows found.",
        )

    df = _normalize_dataframe_columns(df, dtype)
    meta = DATASET_TYPE_META[dtype]
    req_cols = meta["required_columns"]
    missing_cols = [c for c in req_cols if c not in df.columns]
    if missing_cols:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Missing required columns for '{meta['display_name']}': "
                f"{', '.join(missing_cols)}. Required columns are: {', '.join(req_cols)}."
            ),
        )

    total_cells = max(1, df.shape[0] * df.shape[1])
    missing_cells = int(df.isna().sum().sum())
    missing_pct = round((missing_cells / total_cells) * 100.0, 2)

    # Check if required fields have missing values
    req_na_count = int(df[req_cols].isna().sum().sum())
    if req_na_count > 0:
        # Drop rows missing required values if at least 1 valid row remains, otherwise reject
        cleaned_df = df.dropna(subset=req_cols).copy()
        if cleaned_df.empty:
            raise HTTPException(
                status_code=400,
                detail="All rows are missing values in required columns.",
            )
        df = cleaned_df

    # Detect and remove duplicate rows
    dup_count = int(df.duplicated().sum())
    if dup_count > 0:
        df = df.drop_duplicates().reset_index(drop=True)

    # Validate numeric columns
    for num_col in meta["numeric_columns"]:
        coerced = pd.to_numeric(df[num_col], errors="coerce")
        invalid_num = int(coerced.isna().sum())
        if invalid_num > 0:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid numeric data type in column '{num_col}': "
                    f"{invalid_num} row(s) contain non-numeric values."
                ),
            )
        df[num_col] = coerced

    # Validate coordinate ranges if applicable
    invalid_coords = 0
    if "latitude" in meta["coord_columns"] and "longitude" in meta["coord_columns"]:
        lat_s = df["latitude"].astype(float)
        lng_s = df["longitude"].astype(float)
        bad_mask = (lat_s < -90.0) | (lat_s > 90.0) | (lng_s < -180.0) | (lng_s > 180.0)
        invalid_coords = int(bad_mask.sum())
        if invalid_coords > 0:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Coordinate range validation failed: {invalid_coords} row(s) have "
                    f"latitude outside [-90, 90] or longitude outside [-180, 180]."
                ),
            )

    # Extract date range if date or timestamp column exists
    date_range_str = "Validated Operational Snapshot"
    for dcol in ("date", "timestamp"):
        if dcol in df.columns and not df[dcol].dropna().empty:
            vals = sorted(str(v).strip() for v in df[dcol].dropna().tolist() if str(v).strip())
            if vals:
                date_range_str = f"{vals[0]} → {vals[-1]}"
                break

    validation_summary = {
        "valid": True,
        "record_count": int(len(df)),
        "missing_values_pct": missing_pct,
        "duplicate_rows": dup_count,
        "invalid_coordinates": invalid_coords,
        "date_range": date_range_str,
        "columns_validated": req_cols,
        "notes": f"VALID DATASET — {len(df)} records stored in PostgreSQL",
    }
    return df, validation_summary


def import_validated_dataset_to_db(
    db: Session,
    dataset_type: str,
    filename: str,
    df: pd.DataFrame,
    validation_summary: Dict[str, Any],
    uploaded_by: str,
    custom_name: Optional[str] = None,
) -> Dataset:
    """
    Stores validated records into PostgreSQL relational tables inside a single
    atomic transaction (`try ... db.commit() except ... db.rollback()`).
    """
    dtype = dataset_type.strip().lower()
    meta = DATASET_TYPE_META[dtype]
    now = datetime.utcnow()

    try:
        # Create or update Dataset catalog entry for this dataset_type
        existing_datasets = (
            db.query(Dataset)
            .filter(Dataset.dataset_type == dtype)
            .order_by(Dataset.id.asc())
            .all()
        )
        ds = existing_datasets[0] if existing_datasets else None
        if len(existing_datasets) > 1:
            for extra_ds in existing_datasets[1:]:
                db.delete(extra_ds)
            db.flush()

        if not ds:
            ds = Dataset(
                name=custom_name or meta["display_name"],
                dataset_type=dtype,
                filename=filename,
                row_count=int(len(df)),
                status="Ready",
                source_type="Uploaded Dataset",
                uploaded_by=uploaded_by,
                validation_summary=json.dumps(validation_summary),
                created_at=now,
                updated_at=now,
            )
            db.add(ds)
            db.flush()
        else:
            ds.name = custom_name or ds.name
            ds.filename = filename
            ds.row_count = int(len(df))
            ds.status = "Ready"
            ds.source_type = "Uploaded Dataset"
            ds.uploaded_by = uploaded_by
            ds.validation_summary = json.dumps(validation_summary)
            ds.updated_at = now
            db.flush()

        if dtype == "stations":
            uploaded_station_codes = set()
            for _, row in df.iterrows():
                code = str(row["station_code"]).strip().upper()
                uploaded_station_codes.add(code)
                name = str(row["station_name"]).strip()
                lat = float(row["latitude"])
                lng = float(row["longitude"])
                zone = str(row.get("zone", "IR")).strip() or "IR"
                st = db.query(Station).filter(Station.code == code).first()
                if st:
                    st.name = name
                    st.latitude = lat
                    st.longitude = lng
                    st.zone = zone
                else:
                    db.add(
                        Station(
                            code=code,
                            name=name,
                            latitude=lat,
                            longitude=lng,
                            zone=zone,
                        )
                    )
            db.flush()
            for old_st in db.query(Station).all():
                if old_st.code.strip().upper() not in uploaded_station_codes and not old_st.routes:
                    db.delete(old_st)
            db.flush()
            # Synchronize source_name / destination_name on any existing trains
            station_lookup = {s.code: s.name for s in db.query(Station).all()}
            for tr in db.query(Train).all():
                if tr.source in station_lookup:
                    tr.source_name = station_lookup[tr.source]
                if tr.destination in station_lookup:
                    tr.destination_name = station_lookup[tr.destination]
            db.flush()
            ds.row_count = int(len(df))

        elif dtype == "trains":
            if db.query(Station).count() == 0:
                raise HTTPException(
                    status_code=400,
                    detail="No stations exist in database. Upload stations.csv first (STEP 1) before uploading trains.csv (STEP 2).",
                )
            uploaded_train_numbers = set()
            for _, row in df.iterrows():
                t_no = str(row["train_number"]).strip()
                uploaded_train_numbers.add(t_no.upper())
                t_name = str(row["train_name"]).strip()
                src = str(row["source"]).strip().upper()
                dst = str(row["destination"]).strip().upper()
                t_type = str(row.get("train_type", "Superfast")).strip() or "Superfast"
                zone = str(row.get("zone", "IR")).strip() or "IR"
                status_str = str(row.get("status", "On Time")).strip() or "On Time"
                max_spd = float(row.get("max_permissible_speed_kmph", 130.0) or 130.0)
                tot_dist = float(row.get("total_distance_km", 1000.0) or 1000.0)

                src_st = db.query(Station).filter(Station.code == src).first()
                dst_st = db.query(Station).filter(Station.code == dst).first()

                existing_t = db.query(Train).filter(Train.train_number == t_no).first()
                if existing_t:
                    existing_t.train_name = t_name
                    existing_t.source = src
                    existing_t.destination = dst
                    existing_t.source_name = src_st.name if src_st else src
                    existing_t.destination_name = dst_st.name if dst_st else dst
                    existing_t.train_type = t_type
                    existing_t.zone = zone
                    existing_t.status = status_str
                    existing_t.max_permissible_speed_kmph = max_spd
                    if not existing_t.routes:
                        existing_t.total_distance_km = tot_dist
                else:
                    db.add(
                        Train(
                            train_number=t_no,
                            train_name=t_name,
                            source=src,
                            destination=dst,
                            source_name=src_st.name if src_st else src,
                            destination_name=dst_st.name if dst_st else dst,
                            status=status_str,
                            train_type=t_type,
                            zone=zone,
                            max_permissible_speed_kmph=max_spd,
                            total_distance_km=tot_dist,
                        )
                    )
            db.flush()
            # Remove any leftover unrouted trains not present in the newly uploaded trains CSV
            for old_tr in db.query(Train).all():
                if old_tr.train_number.strip().upper() not in uploaded_train_numbers and not old_tr.routes:
                    db.delete(old_tr)
            db.flush()

        elif dtype == "routes":
            from app.services.eta_service import recalculate_train_predictions, resolve_train
            from app.services.telemetry_providers import interpolate_route_position

            all_stations = db.query(Station).all()
            station_by_code = {s.code.strip().upper(): s for s in all_stations}
            station_by_id = {str(s.id): s for s in all_stations}

            affected_trains: Dict[int, Train] = {}
            uploaded_train_stops: Dict[int, set] = {}
            for _, row in df.iterrows():
                t_no = str(row["train_number"]).strip()
                seq = int(row["sequence"])
                st_code = str(row["station_code"]).strip().upper()
                dist_km = float(row["distance_km"])
                arr = str(row.get("scheduled_arrival", "12:00")).strip() or "12:00"
                dep = str(row.get("scheduled_departure", arr)).strip() or arr
                pf = str(row.get("platform", "1")).strip() or "1"
                halt = int(row.get("halt_mins", 2) or 2)
                sec_mins = float(row.get("scheduled_section_running_time_mins", 0.0) or 0.0)
                hist_delay = float(row.get("historical_avg_delay_mins", 5.0) or 5.0)

                train_obj = resolve_train(db, t_no)
                if not train_obj:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Train '{t_no}' referenced in routes.csv does not exist. "
                            f"Please upload trains.csv (STEP 2) before uploading routes.csv (STEP 3)."
                        ),
                    )
                st_obj = station_by_code.get(st_code) or station_by_id.get(st_code)
                if not st_obj:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Station '{st_code}' referenced in routes.csv does not exist. "
                            f"Please upload stations.csv (STEP 1) before uploading routes.csv (STEP 3)."
                        ),
                    )

                existing_r = (
                    db.query(Route)
                    .filter(
                        Route.train_id == train_obj.id,
                        Route.station_id == st_obj.id,
                    )
                    .first()
                )
                if existing_r:
                    existing_r.sequence = seq
                    existing_r.distance_from_origin = dist_km
                    existing_r.scheduled_arrival = arr
                    existing_r.scheduled_departure = dep
                    existing_r.platform = pf
                    existing_r.halt_mins = halt
                    if sec_mins > 0:
                        existing_r.scheduled_section_running_time_mins = sec_mins
                else:
                    db.add(
                        Route(
                            train_id=train_obj.id,
                            station_id=st_obj.id,
                            sequence=seq,
                            scheduled_arrival=arr,
                            scheduled_departure=dep,
                            distance_from_origin=dist_km,
                            platform=pf,
                            halt_mins=halt,
                            scheduled_section_running_time_mins=(
                                sec_mins if sec_mins > 0 else max(0.0, round(dist_km * 0.55, 1))
                            ),
                            historical_avg_delay_mins=hist_delay,
                        )
                    )
                affected_trains[train_obj.id] = train_obj
                uploaded_train_stops.setdefault(train_obj.id, set()).add(st_obj.id)

            db.flush()

            # Initialize route section running times, initial position along uploaded route, and ML predictions
            for tr in affected_trains.values():
                db.refresh(tr)
                # Remove any stale stops for this train that were not in the uploaded routes.csv
                valid_st_ids = uploaded_train_stops.get(tr.id, set())
                if valid_st_ids:
                    for r_old in list(tr.routes):
                        if r_old.station_id not in valid_st_ids:
                            db.delete(r_old)
                    db.flush()
                    db.refresh(tr)

                sorted_routes = sorted(tr.routes, key=lambda r: r.sequence)
                for idx_r, r_stop in enumerate(sorted_routes):
                    if idx_r == 0:
                        r_stop.scheduled_section_running_time_mins = 0.0
                    elif r_stop.scheduled_section_running_time_mins <= 0:
                        prev_dist = sorted_routes[idx_r - 1].distance_from_origin
                        seg_dist = max(5.0, r_stop.distance_from_origin - prev_dist)
                        r_stop.scheduled_section_running_time_mins = round((seg_dist / 90.0) * 60.0, 1)

                if sorted_routes:
                    total_d = max(1.0, float(sorted_routes[-1].distance_from_origin or tr.total_distance_km))
                    tr.total_distance_km = total_d
                    init_cov = round(total_d * 0.45, 1) if len(sorted_routes) > 1 else 0.0
                    interp = interpolate_route_position(tr, init_cov)
                    if not tr.positions:
                        db.add(
                            TrainPosition(
                                train_id=tr.id,
                                timestamp=now,
                                latitude=float(interp["latitude"]),
                                longitude=float(interp["longitude"]),
                                speed=105.0,
                                delay_minutes=8.0,
                                distance_covered_km=float(interp["distance_covered_km"]),
                                distance_remaining_km=float(interp["distance_remaining_km"]),
                                previous_station_code=interp["previous_station_code"],
                                next_station_code=interp["next_station_code"],
                                weather_condition="Clear",
                                weather_severity=0.10,
                                weather_temp_c=28.0,
                                weather_visibility_km=9.5,
                                congestion_level="Low",
                                congestion_index=0.20,
                                data_source="Uploaded Dataset",
                            )
                        )
                    else:
                        latest_pos = tr.positions[0]
                        if (
                            latest_pos.distance_covered_km >= total_d
                            or latest_pos.latitude == 0.0
                            or latest_pos.longitude == 0.0
                        ):
                            latest_pos.latitude = float(interp["latitude"])
                            latest_pos.longitude = float(interp["longitude"])
                            latest_pos.distance_covered_km = float(interp["distance_covered_km"])
                            latest_pos.distance_remaining_km = float(interp["distance_remaining_km"])
                            latest_pos.previous_station_code = interp["previous_station_code"]
                            latest_pos.next_station_code = interp["next_station_code"]
                    db.flush()
                    db.refresh(tr)

                recalculate_train_predictions(db, tr, force_ml=True)

        elif dtype == "historical_runs":
            from app.services.eta_service import recalculate_train_predictions

            train_map = {t.train_number: t for t in db.query(Train).all()}
            station_map = {s.code: s for s in db.query(Station).all()}
            affected_trains_hr: Dict[int, Train] = {}

            for _, row in df.iterrows():
                t_no = str(row["train_number"]).strip()
                st_code = str(row["station_code"]).strip().upper()
                train_obj = train_map.get(t_no)
                if not train_obj:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Train '{t_no}' in historical_runs.csv not found in database. "
                            f"Please upload trains.csv (STEP 2) before uploading historical_runs.csv (STEP 4)."
                        ),
                    )

                st_obj = station_map.get(st_code)
                if not st_obj:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Station '{st_code}' in historical_runs.csv not found in database. "
                            f"Please upload stations.csv (STEP 1) before uploading historical_runs.csv (STEP 4)."
                        ),
                    )

                delay_val = float(row["delay"])
                speed_val = float(row["speed"])
                run_time = float(row["running_time"])
                date_str = str(row["date"]).strip()
                sched_arr = str(row["scheduled_arrival"]).strip()
                act_arr = str(row["actual_arrival"]).strip()

                _, w_sev, _, _ = parse_weather_Descriptor(row.get("weather", 0.1))
                _, c_idx = parse_congestion_descriptor(row.get("congestion", 0.25))

                db.add(
                    HistoricalRun(
                        train_id=train_obj.id,
                        station_id=st_obj.id,
                        date=date_str,
                        scheduled_arrival=sched_arr,
                        actual_arrival=act_arr,
                        delay_minutes=delay_val,
                        running_time=run_time,
                        current_delay=float(row.get("current_delay", delay_val)),
                        current_speed=speed_val,
                        distance_to_next_station=float(
                            row.get("distance_to_next_station", 65.0)
                        ),
                        distance_to_destination=float(
                            row.get("distance_to_destination", 240.0)
                        ),
                        historical_section_running_time=run_time,
                        historical_average_delay=max(0.0, delay_val * 0.85),
                        sequence=int(row.get("sequence", 3)),
                        day_of_week=int(row.get("day_of_week", 1)),
                        hour=int(row.get("hour", 14)),
                        weather=w_sev,
                        congestion=c_idx,
                        previous_station_delay=float(
                            row.get("previous_station_delay", delay_val)
                        ),
                    )
                )
                affected_trains_hr[train_obj.id] = train_obj
            db.flush()

            for tr in affected_trains_hr.values():
                db.refresh(tr)
                recalculate_train_predictions(db, tr, force_ml=True)

        elif dtype == "weather":
            for _, row in df.iterrows():
                cond_str = str(row["condition"]).strip()
                db.add(
                    WeatherRecord(
                        dataset_id=ds.id,
                        timestamp=str(row["timestamp"]).strip(),
                        latitude=float(row["latitude"]),
                        longitude=float(row["longitude"]),
                        temperature=float(row["temperature"]),
                        rainfall=float(row["rainfall"]),
                        visibility=float(row["visibility"]),
                        wind_speed=float(row["wind_speed"]),
                        condition=cond_str,
                    )
                )
            db.flush()

        elif dtype == "telemetry":
            from app.services.eta_service import recalculate_train_predictions
            from app.services.ingestion_service import ingest_live_telemetry
            from app.services.telemetry_providers import project_coordinates_to_route

            # Replace previous uploaded playback sequence for the same train numbers so playback uses the freshly uploaded CSV
            train_nos = {str(v).strip() for v in df["train_number"].unique()}
            for t_no in train_nos:
                db.query(TelemetryRecord).filter(
                    TelemetryRecord.train_number == t_no
                ).delete()

            latest_row_by_train: Dict[str, Any] = {}
            for seq_idx, (_, row) in enumerate(df.iterrows(), start=1):
                t_no = str(row["train_number"]).strip()
                db.add(
                    TelemetryRecord(
                        dataset_id=ds.id,
                        sequence_index=seq_idx,
                        timestamp=str(row["timestamp"]).strip(),
                        train_number=t_no,
                        latitude=float(row["latitude"]),
                        longitude=float(row["longitude"]),
                        speed=float(row["speed"]),
                        delay=float(row["delay"]),
                        weather=str(row["weather"]).strip(),
                        congestion=str(row["congestion"]).strip(),
                    )
                )
                latest_row_by_train[t_no] = row
            db.flush()

            # Apply initial uploaded telemetry frame to matching existing trains
            for t_no, row in latest_row_by_train.items():
                tr = db.query(Train).filter(Train.train_number == t_no).first()
                if tr and tr.routes:
                    w_label, w_sev, w_temp, w_vis = parse_weather_Descriptor(row["weather"])
                    c_label, c_idx = parse_congestion_descriptor(row["congestion"])
                    proj = project_coordinates_to_route(
                        tr, float(row["latitude"]), float(row["longitude"])
                    )
                    ingest_live_telemetry(
                        db=db,
                        train=tr,
                        latitude=float(proj["latitude"]),
                        longitude=float(proj["longitude"]),
                        speed=float(row["speed"]),
                        delay_minutes=float(row["delay"]),
                        distance_covered_km=float(proj["distance_covered_km"]),
                        previous_station_code=proj["previous_station_code"],
                        next_station_code=proj["next_station_code"],
                        weather_condition=w_label,
                        weather_severity=w_sev,
                        weather_temp_c=w_temp,
                        weather_visibility_km=w_vis,
                        congestion_level=c_label,
                        congestion_index=c_idx,
                        data_source="UPLOADED TELEMETRY",
                    )
                    recalculate_train_predictions(db, tr, force_ml=True)

        ds.source_type = "Uploaded Dataset"
        db.commit()
        db.refresh(ds)
        return ds
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Database transaction rolled back due to invalid data: {exc}",
        )


def generate_csv_template(dataset_type: str) -> Tuple[str, str]:
    """
    Returns (filename, csv_text) for the requested dataset template.
    Self-consistent across Steps 1–6 (stations -> trains -> routes -> historical_runs -> weather -> telemetry).
    """
    dtype = dataset_type.strip().lower()
    if dtype == "stations":
        csv_text = (
            "station_code,station_name,latitude,longitude,zone\n"
            "MMCT,Mumbai Central,18.9696,72.8193,WR\n"
            "BVI,Borivali,19.2291,72.8573,WR\n"
            "ST,Surat,21.2045,72.8408,WR\n"
            "BRC,Vadodara Junction,22.3106,73.1812,WR\n"
            "RTM,Ratlam Junction,23.3342,75.0488,WR\n"
            "KOTA,Kota Junction,25.2238,75.8806,WCR\n"
            "SWM,Sawai Madhopur Junction,26.0173,76.3526,WCR\n"
            "MTJ,Mathura Junction,27.4744,77.6739,NCR\n"
            "NDLS,New Delhi,28.6429,77.2191,NR\n"
            "CNB,Kanpur Central,26.4539,80.3512,NCR\n"
            "PRYJ,Prayagraj Junction,25.4448,81.8275,NCR\n"
            "BSB,Varanasi Junction,25.3271,82.9860,NR\n"
            "HWH,Howrah Junction,22.5839,88.3426,ER\n"
            "DHN,Dhanbad Junction,23.7913,86.4300,ECR\n"
            "GAYA,Gaya Junction,24.8036,84.9994,ECR\n"
            "DDU,Pt. DD Upadhyaya Junction,25.2797,83.1197,ECR\n"
        )
        return ("stations.csv", csv_text)

    if dtype == "trains":
        csv_text = (
            "train_number,train_name,source,destination,train_type,zone,status,max_permissible_speed_kmph,total_distance_km\n"
            "12951,Mumbai Central - New Delhi Tejas Rajdhani Express,MMCT,NDLS,Rajdhani,WR / Western Railway,Running Late by 12m,130.0,1384.0\n"
            "22436,New Delhi - Varanasi Vande Bharat Express,NDLS,BSB,Vande Bharat,NR / Northern Railway,On Time,130.0,759.0\n"
            "12301,Howrah - New Delhi Rajdhani Express,HWH,NDLS,Rajdhani,ER / Eastern Railway,Running Late by 24m,130.0,1451.0\n"
        )
        return ("trains.csv", csv_text)

    if dtype == "routes":
        csv_text = (
            "train_number,sequence,station_code,distance_km,scheduled_arrival,scheduled_departure,platform,halt_mins\n"
            "12951,1,MMCT,0.0,17:00,17:00,1,0\n"
            "12951,2,BVI,30.0,17:22,17:24,6,2\n"
            "12951,3,ST,263.0,19:43,19:48,1,5\n"
            "12951,4,BRC,392.0,21:06,21:16,2,10\n"
            "12951,5,RTM,653.0,00:25,00:28,4,3\n"
            "12951,6,KOTA,920.0,03:15,03:20,1,5\n"
            "12951,7,SWM,1028.0,04:23,04:25,2,2\n"
            "12951,8,MTJ,1243.0,06:18,06:20,3,2\n"
            "12951,9,NDLS,1384.0,08:32,08:32,3,0\n"
            "22436,1,NDLS,0.0,06:00,06:00,16,0\n"
            "22436,2,CNB,440.0,10:08,10:10,1,2\n"
            "22436,3,PRYJ,635.0,12:08,12:10,6,2\n"
            "22436,4,BSB,759.0,14:00,14:00,1,0\n"
            "12301,1,HWH,0.0,16:50,16:50,9,0\n"
            "12301,2,DHN,259.0,20:00,20:05,2,5\n"
            "12301,3,GAYA,458.0,22:53,22:56,1,3\n"
            "12301,4,DDU,661.0,01:25,01:35,4,10\n"
            "12301,5,PRYJ,813.0,03:18,03:20,2,2\n"
            "12301,6,CNB,1008.0,05:15,05:20,3,5\n"
            "12301,7,NDLS,1451.0,10:05,10:05,5,0\n"
        )
        return ("routes.csv", csv_text)

    if dtype == "historical_runs":
        csv_text = (
            "train_number,station_code,date,scheduled_arrival,actual_arrival,delay,speed,running_time\n"
            "12951,BVI,2026-09-01,17:22,17:25,3.0,98.0,22.0\n"
            "12951,ST,2026-09-01,19:43,19:51,8.0,115.0,139.0\n"
            "12951,BRC,2026-09-01,21:06,21:18,12.0,112.0,78.0\n"
            "12951,RTM,2026-09-01,00:25,00:39,14.0,110.0,189.0\n"
            "12951,KOTA,2026-09-01,03:15,03:27,12.0,118.0,165.0\n"
            "12951,SWM,2026-09-01,04:23,04:32,9.0,121.5,63.0\n"
            "12951,MTJ,2026-09-01,06:18,06:24,6.0,124.0,113.0\n"
            "12951,NDLS,2026-09-01,08:32,08:36,4.0,115.0,130.0\n"
            "12951,KOTA,2026-09-02,03:15,03:33,18.0,110.0,171.0\n"
            "12951,SWM,2026-09-02,04:23,04:37,14.0,116.0,65.0\n"
            "12951,MTJ,2026-09-02,06:18,06:29,11.0,119.0,115.0\n"
            "12951,NDLS,2026-09-02,08:32,08:40,8.0,114.0,132.0\n"
            "22436,CNB,2026-09-03,10:08,10:11,3.0,128.0,248.0\n"
            "22436,PRYJ,2026-09-03,12:08,12:10,2.0,126.0,118.0\n"
            "22436,BSB,2026-09-03,14:00,14:01,1.0,124.0,110.0\n"
            "12301,DHN,2026-09-04,20:00,20:14,14.0,105.0,190.0\n"
            "12301,GAYA,2026-09-04,22:53,23:12,19.0,102.0,168.0\n"
            "12301,DDU,2026-09-04,01:25,01:48,23.0,104.0,149.0\n"
            "12301,PRYJ,2026-09-04,03:18,03:38,20.0,112.0,103.0\n"
            "12301,CNB,2026-09-04,05:15,05:31,16.0,118.0,115.0\n"
            "12301,NDLS,2026-09-04,10:05,10:17,12.0,120.0,285.0\n"
        )
        return ("historical_runs.csv", csv_text)

    if dtype == "weather":
        csv_text = (
            "timestamp,latitude,longitude,temperature,rainfall,visibility,wind_speed,condition\n"
            "2026-09-28 18:00:00,24.5854,75.8362,28.5,0.0,9.2,11.4,Clear\n"
            "2026-09-28 18:30:00,25.2238,75.8806,27.8,0.0,8.8,12.0,Light Haze\n"
            "2026-09-28 19:00:00,26.0173,76.3526,26.2,2.4,6.5,16.5,Light Rain\n"
            "2026-09-28 19:30:00,27.4744,77.6739,24.5,0.0,5.0,10.2,Fog / Mist\n"
        )
        return ("weather.csv", csv_text)

    if dtype == "telemetry":
        csv_text = (
            "timestamp,train_number,latitude,longitude,speed,delay,weather,congestion\n"
            "2026-09-28 17:45:00,12951,23.6500,75.2000,116.0,14.0,Clear,Low\n"
            "2026-09-28 18:00:00,12951,23.9500,75.3300,120.0,12.0,Clear,Moderate\n"
            "2026-09-28 18:15:00,12951,24.2500,75.4600,124.0,10.0,Clear,Low\n"
            "2026-09-28 18:30:00,12951,24.5500,75.5900,112.0,9.0,Light Haze,Moderate\n"
            "2026-09-28 18:45:00,12951,24.7500,75.6700,126.0,7.0,Clear,Low\n"
            "2026-09-28 19:00:00,12951,24.9500,75.7600,122.0,6.0,Clear,Low\n"
        )
        return ("telemetry.csv", csv_text)

    raise HTTPException(status_code=404, detail=f"Template '{dataset_type}' not found.")
