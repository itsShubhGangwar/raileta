"""
Telemetry Provider Abstraction & Route Coordinate Interpolation (`backend/app/services/telemetry_providers.py`).
----------------------------------------------------------------------------------------------------------------
Separates telemetry ingestion from the ML prediction pipeline:
  TelemetryProvider
    ├── SimulatorTelemetryProvider       (SIMULATED LIVE — deterministic route interpolation)
    ├── ManualTelemetryProvider          (MANUAL TELEMETRY — authenticated Demo Control updates)
    ├── UploadedTelemetryProvider        (UPLOADED TELEMETRY — CSV playback from PostgreSQL)
    └── ExternalRailwayTelemetryProvider (EXTERNAL API — Requires an authorized external railway data provider)
"""

from abc import ABC, abstractmethod
import math
import os
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from sqlalchemy.orm import Session

from app.models.railway import Route, SystemState, TelemetryRecord, Train, TrainPosition


WEATHER_MAP: Dict[str, Tuple[str, float, float, float]] = {
    "clear": ("Clear Sky", 0.08, 29.0, 10.0),
    "clear sky": ("Clear Sky", 0.08, 29.0, 10.0),
    "sunny": ("Sunny & Clear", 0.05, 31.0, 10.0),
    "light haze": ("Clear / Light Haze", 0.12, 28.5, 9.0),
    "haze": ("Light Haze", 0.18, 27.5, 7.5),
    "mist": ("Mist / High Humidity", 0.35, 23.5, 5.2),
    "fog": ("Dense Fog", 0.68, 16.0, 1.8),
    "fog / mist": ("Fog / Mist", 0.55, 19.0, 3.0),
    "light rain": ("Light Rain Showers", 0.32, 25.0, 6.5),
    "rain": ("Moderate Rain", 0.48, 24.0, 4.5),
    "heavy rain": ("Heavy Monsoon Rain", 0.75, 22.5, 2.5),
    "storm": ("Severe Storm / Squall", 0.88, 21.0, 1.5),
}

CONGESTION_MAP: Dict[str, Tuple[str, float]] = {
    "low": ("Low (Green Block)", 0.14),
    "moderate": ("Moderate (Junction Approach)", 0.32),
    "medium": ("Moderate (Junction Approach)", 0.35),
    "high": ("High (Outer Yard Bottleneck)", 0.65),
    "severe": ("Severe (Signal Hold / Crossing)", 0.88),
}


def parse_weather_Descriptor(weather_input: Any) -> Tuple[str, float, float, float]:
    if isinstance(weather_input, (int, float)):
        sev = float(np.clip(weather_input, 0.0, 1.0))
        if sev < 0.2:
            return ("Clear Sky", sev, 29.0, 9.5)
        if sev < 0.45:
            return ("Light Rain / Mist", sev, 25.0, 6.0)
        if sev < 0.7:
            return ("Heavy Rain / Fog", sev, 22.0, 3.2)
        return ("Severe Weather Restriction", sev, 19.0, 1.8)

    raw = str(weather_input or "Clear").strip()
    key = raw.lower()
    if key in WEATHER_MAP:
        return WEATHER_MAP[key]
    for k, val in WEATHER_MAP.items():
        if k in key:
            return (raw, val[1], val[2], val[3])
    try:
        num = float(raw)
        return parse_weather_Descriptor(num)
    except ValueError:
        return (raw or "Clear Sky", 0.15, 28.0, 8.5)


def parse_congestion_descriptor(congestion_input: Any) -> Tuple[str, float]:
    if isinstance(congestion_input, (int, float)):
        idx = float(np.clip(congestion_input, 0.0, 1.0))
        if idx < 0.25:
            return ("Low", idx)
        if idx < 0.50:
            return ("Moderate", idx)
        if idx < 0.75:
            return ("High", idx)
        return ("Severe", idx)

    raw = str(congestion_input or "Low").strip()
    key = raw.lower()
    if key in CONGESTION_MAP:
        return CONGESTION_MAP[key]
    for k, val in CONGESTION_MAP.items():
        if k in key:
            return (raw, val[1])
    try:
        num = float(raw)
        return parse_congestion_descriptor(num)
    except ValueError:
        return (raw or "Moderate", 0.28)


def interpolate_route_position(
    train: Train,
    distance_covered_km: float,
) -> Dict[str, Any]:
    """
    Interpolates exact geographic (latitude, longitude) coordinates along the train's
    ordered route stops (`Route` + `Station`) for a given `distance_covered_km`.
    Guarantees the train moves strictly along actual station-to-station route segments.
    Never returns synthetic/fallback coordinates when no route exists.
    """
    routes_sorted: List[Route] = sorted(train.routes, key=lambda r: r.sequence)
    if not routes_sorted:
        return {
            "latitude": 0.0,
            "longitude": 0.0,
            "distance_covered_km": 0.0,
            "distance_remaining_km": 0.0,
            "previous_station_code": train.source,
            "next_station_code": train.destination,
        }

    route_end_dist = float(routes_sorted[-1].distance_from_origin or 0.0)
    total_route_dist = max(
        1.0,
        route_end_dist if route_end_dist > 0 else float(train.total_distance_km or 100.0),
    )
    clamped_dist = float(np.clip(distance_covered_km, 0.0, total_route_dist))

    if len(routes_sorted) == 1:
        st = routes_sorted[0].station
        return {
            "latitude": round(float(st.latitude), 5),
            "longitude": round(float(st.longitude), 5),
            "distance_covered_km": round(clamped_dist, 1),
            "distance_remaining_km": round(max(0.0, total_route_dist - clamped_dist), 1),
            "previous_station_code": st.code,
            "next_station_code": st.code,
        }

    # Find segment [stop_a, stop_b] containing clamped_dist
    stop_a = routes_sorted[0]
    stop_b = routes_sorted[1]
    for idx in range(len(routes_sorted) - 1):
        ra = routes_sorted[idx]
        rb = routes_sorted[idx + 1]
        if ra.distance_from_origin <= clamped_dist <= rb.distance_from_origin:
            stop_a = ra
            stop_b = rb
            break
    else:
        if clamped_dist >= routes_sorted[-1].distance_from_origin:
            stop_a = routes_sorted[-2]
            stop_b = routes_sorted[-1]

    seg_len = max(0.1, float(stop_b.distance_from_origin - stop_a.distance_from_origin))
    ratio = float(np.clip((clamped_dist - stop_a.distance_from_origin) / seg_len, 0.0, 1.0))

    lat = float(stop_a.station.latitude) + ratio * (
        float(stop_b.station.latitude) - float(stop_a.station.latitude)
    )
    lng = float(stop_a.station.longitude) + ratio * (
        float(stop_b.station.longitude) - float(stop_a.station.longitude)
    )

    return {
        "latitude": round(lat, 5),
        "longitude": round(lng, 5),
        "distance_covered_km": round(clamped_dist, 1),
        "distance_remaining_km": round(max(0.0, total_route_dist - clamped_dist), 1),
        "previous_station_code": stop_a.station.code,
        "next_station_code": stop_b.station.code,
    }


def project_coordinates_to_route(
    train: Train,
    latitude: float,
    longitude: float,
) -> Dict[str, Any]:
    """
    Given explicit (latitude, longitude) coordinates, projects onto the closest
    route segment of `train` to determine distance_covered_km, previous_station_code,
    and next_station_code while preserving the supplied coordinates.
    """
    routes_sorted: List[Route] = sorted(train.routes, key=lambda r: r.sequence)
    if len(routes_sorted) < 2:
        latest = train.positions[0] if train.positions else None
        cov = latest.distance_covered_km if latest else 0.0
        return {
            "latitude": round(float(latitude), 5),
            "longitude": round(float(longitude), 5),
            "distance_covered_km": round(cov, 1),
            "distance_remaining_km": round(max(0.0, train.total_distance_km - cov), 1),
            "previous_station_code": latest.previous_station_code if latest else train.source,
            "next_station_code": latest.next_station_code if latest else train.destination,
        }

    best_dist_sq = float("inf")
    best_covered = 0.0
    best_prev = routes_sorted[0].station.code
    best_next = routes_sorted[1].station.code

    for idx in range(len(routes_sorted) - 1):
        ra = routes_sorted[idx]
        rb = routes_sorted[idx + 1]
        ax, ay = float(ra.station.latitude), float(ra.station.longitude)
        bx, by = float(rb.station.latitude), float(rb.station.longitude)
        dx, dy = bx - ax, by - ay
        seg_norm_sq = dx * dx + dy * dy
        if seg_norm_sq < 1e-9:
            t = 0.0
        else:
            t = ((latitude - ax) * dx + (longitude - ay) * dy) / seg_norm_sq
            t = max(0.0, min(1.0, t))
        proj_x = ax + t * dx
        proj_y = ay + t * dy
        d_sq = (latitude - proj_x) ** 2 + (longitude - proj_y) ** 2
        if d_sq < best_dist_sq:
            best_dist_sq = d_sq
            best_covered = float(ra.distance_from_origin) + t * float(
                rb.distance_from_origin - ra.distance_from_origin
            )
            best_prev = ra.station.code
            best_next = rb.station.code

    route_end_dist = float(routes_sorted[-1].distance_from_origin or 0.0)
    total_dist = max(
        1.0,
        route_end_dist if route_end_dist > 0 else float(train.total_distance_km or 100.0),
    )
    return {
        "latitude": round(float(latitude), 5),
        "longitude": round(float(longitude), 5),
        "distance_covered_km": round(best_covered, 1),
        "distance_remaining_km": round(max(0.0, total_dist - best_covered), 1),
        "previous_station_code": best_prev,
        "next_station_code": best_next,
    }


def get_or_create_system_state(db: Session) -> SystemState:
    state = db.query(SystemState).filter(SystemState.key == "global").first()
    if not state:
        state = SystemState(
            key="global",
            data_mode="AUTOMATIC_SIMULATION",
            active_data_source="SIMULATED LIVE",
            playback_status="STOPPED",
            playback_speed=1.0,
            playback_train_number="",
            playback_index=0,
        )
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


class TelemetryProvider(ABC):
    """Abstract base class for RailETA telemetry providers."""

    source_badge: str = "SIMULATED LIVE"

    @abstractmethod
    def get_provider_metadata(self) -> Dict[str, Any]:
        pass


class SimulatorTelemetryProvider(TelemetryProvider):
    """
    Deterministic route-interpolated simulator provider (`SIMULATED LIVE`).
    Moves trains smoothly along their station-to-station route coordinates.
    """

    source_badge = "SIMULATED LIVE"

    def __init__(self, seed: int = 42):
        self.rng = np.random.default_rng(seed)

    def get_provider_metadata(self) -> Dict[str, Any]:
        return {
            "provider": "SimulatorTelemetryProvider",
            "data_source": self.source_badge,
            "category": "Prototype Data",
            "description": "Deterministic route-interpolated telemetry simulation along station coordinates.",
        }

    def generate_next_state(self, train: Train) -> Dict[str, Any]:
        latest: Optional[TrainPosition] = train.positions[0] if train.positions else None
        routes_sorted = sorted(train.routes, key=lambda r: r.sequence)
        route_end_dist = float(routes_sorted[-1].distance_from_origin if routes_sorted else 0.0)
        total_dist = max(
            1.0,
            route_end_dist if route_end_dist > 0 else float(train.total_distance_km or 100.0),
        )

        curr_covered = float(latest.distance_covered_km) if latest else round(total_dist * 0.30, 1)
        curr_speed = float(latest.speed) if latest else 105.0
        curr_delay = float(latest.delay_minutes) if latest else 6.0

        # Advance 1.8 km along the route per simulator tick so movement along the route is visible
        next_covered = curr_covered + 1.8
        if next_covered >= max(5.0, total_dist - 8.0):
            # Loop back to an active mid-route section for continuous operation
            next_covered = round(total_dist * 0.25, 1)

        interp = interpolate_route_position(train, next_covered)

        speed_delta = float(self.rng.uniform(-2.5, 3.0))
        new_speed = float(
            np.clip(
                curr_speed + speed_delta,
                52.0,
                float(train.max_permissible_speed_kmph or 130.0),
            )
        )

        delay_shift = float(self.rng.choice([-0.5, 0.0, 0.0, 0.5]))
        new_delay = float(np.clip(curr_delay + delay_shift, 0.0, 90.0))

        return {
            **interp,
            "speed": round(new_speed, 1),
            "delay_minutes": round(new_delay, 1),
            "weather_condition": latest.weather_condition if latest else "Clear Sky",
            "weather_severity": float(latest.weather_severity) if latest else 0.10,
            "weather_temp_c": float(latest.weather_temp_c) if latest else 28.5,
            "weather_visibility_km": float(latest.weather_visibility_km) if latest else 9.2,
            "congestion_level": latest.congestion_level if latest else "Moderate",
            "congestion_index": float(latest.congestion_index) if latest else 0.25,
            "data_source": self.source_badge,
        }


class ManualTelemetryProvider(TelemetryProvider):
    """
    Processes authenticated manual telemetry overrides from `/demo-control` (`MANUAL TELEMETRY`).
    """

    source_badge = "MANUAL TELEMETRY"

    def get_provider_metadata(self) -> Dict[str, Any]:
        return {
            "provider": "ManualTelemetryProvider",
            "data_source": self.source_badge,
            "category": "Synthetic/Prototype Data",
            "description": "User-controlled manual telemetry parameters persisted in PostgreSQL.",
        }

    def build_state_from_input(
        self,
        train: Train,
        speed: float,
        delay: float,
        weather: str,
        congestion: str,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
    ) -> Dict[str, Any]:
        latest: Optional[TrainPosition] = train.positions[0] if train.positions else None
        if latitude is not None and longitude is not None:
            pos_info = project_coordinates_to_route(train, float(latitude), float(longitude))
        else:
            cov = float(latest.distance_covered_km) if latest else 250.0
            pos_info = interpolate_route_position(train, cov)

        w_cond, w_sev, w_temp, w_vis = parse_weather_Descriptor(weather)
        c_label, c_idx = parse_congestion_descriptor(congestion)

        return {
            **pos_info,
            "speed": round(float(speed), 1),
            "delay_minutes": round(float(delay), 1),
            "weather_condition": w_cond,
            "weather_severity": round(w_sev, 2),
            "weather_temp_c": w_temp,
            "weather_visibility_km": w_vis,
            "congestion_level": c_label,
            "congestion_index": round(c_idx, 2),
            "data_source": self.source_badge,
        }


class UploadedTelemetryProvider(TelemetryProvider):
    """
    Streams uploaded/seeded CSV telemetry rows from PostgreSQL `telemetry_records` (`UPLOADED TELEMETRY`).
    """

    source_badge = "UPLOADED TELEMETRY"

    def get_provider_metadata(self) -> Dict[str, Any]:
        return {
            "provider": "UploadedTelemetryProvider",
            "data_source": self.source_badge,
            "category": "Synthetic/Prototype Data",
            "description": "Sequential CSV telemetry playback stored in PostgreSQL.",
        }

    def build_state_from_record(self, train: Train, rec: TelemetryRecord) -> Dict[str, Any]:
        pos_info = project_coordinates_to_route(train, float(rec.latitude), float(rec.longitude))
        w_cond, w_sev, w_temp, w_vis = parse_weather_Descriptor(rec.weather)
        c_label, c_idx = parse_congestion_descriptor(rec.congestion)
        return {
            **pos_info,
            "speed": round(float(rec.speed), 1),
            "delay_minutes": round(float(rec.delay), 1),
            "weather_condition": w_cond,
            "weather_severity": round(w_sev, 2),
            "weather_temp_c": w_temp,
            "weather_visibility_km": w_vis,
            "congestion_level": c_label,
            "congestion_index": round(c_idx, 2),
            "data_source": self.source_badge,
        }


class ExternalRailwayTelemetryProvider(TelemetryProvider):
    """
    Adapter for an authorized external railway/GPS telemetry feed (`EXTERNAL API`).
    Reads RAILWAY_API_URL and RAILWAY_API_KEY from environment variables.
    Does NOT fabricate an external API or credentials.
    """

    source_badge = "EXTERNAL API"

    def __init__(self):
        self.api_url = os.getenv("RAILWAY_API_URL", "").strip()
        self.api_key = os.getenv("RAILWAY_API_KEY", "").strip()

    def is_configured(self) -> bool:
        return bool(self.api_url and self.api_key)

    def get_provider_metadata(self) -> Dict[str, Any]:
        return {
            "provider": "ExternalRailwayTelemetryProvider",
            "data_source": self.source_badge,
            "configured": self.is_configured(),
            "requirement_note": "Requires an authorized external railway data provider.",
            "env_vars": ["RAILWAY_API_URL", "RAILWAY_API_KEY"],
        }


simulator_provider = SimulatorTelemetryProvider(seed=42)
manual_provider = ManualTelemetryProvider()
uploaded_provider = UploadedTelemetryProvider()
external_provider = ExternalRailwayTelemetryProvider()
