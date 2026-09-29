"""
Feature Engineering Module for RailETA ML Pipeline.
Transforms raw train, station, route, kinematic, and environmental inputs
into the 14 core features required by HistGradientBoostingRegressor.
"""

from typing import Any, Dict, List
import numpy as np
import pandas as pd

# Exact 14 required ML features from specification
MODEL_FEATURE_COLUMNS: List[str] = [
    "current_delay",
    "current_speed",
    "distance_to_next_station",
    "distance_to_destination",
    "historical_section_running_time",
    "historical_average_delay",
    "train_encoded",
    "station_encoded",
    "route_encoded",
    "day_of_week",
    "hour",
    "weather",
    "congestion",
    "previous_station_delay",
]

TRAIN_ENCODING_MAP: Dict[str, int] = {
    "12951": 1,  # Mumbai - New Delhi Tejas Rajdhani (Tier 1)
    "22436": 2,  # New Delhi - Varanasi Vande Bharat (Tier 1)
    "12301": 3,  # Howrah - New Delhi Rajdhani (Tier 1)
    "12002": 4,  # New Delhi - Bhopal Shatabdi (Tier 1)
    "12627": 5,  # KSR Bengaluru - New Delhi Karnataka Exp (Tier 2)
    "20607": 6,  # Chennai - Mysuru Vande Bharat (Tier 1)
}

STATION_ENCODING_MAP: Dict[str, int] = {
    "MMCT": 1,
    "BVI": 2,
    "ST": 3,
    "BRC": 4,
    "RTM": 5,
    "KOTA": 6,
    "SWM": 7,
    "MTJ": 8,
    "NDLS": 9,
    "CNB": 10,
    "PRYJ": 11,
    "BSB": 12,
    "HWH": 13,
    "DHN": 14,
    "GAYA": 15,
    "DDU": 16,
    "AGC": 17,
    "GWL": 18,
    "VGLJ": 19,
    "RKMP": 20,
    "SBC": 21,
    "GTL": 22,
    "BPQ": 23,
    "NGP": 24,
    "BPL": 25,
    "MAS": 26,
    "KPD": 27,
    "MYS": 28,
}

ROUTE_ENCODING_MAP: Dict[str, int] = {
    "MMCT-NDLS": 1,
    "NDLS-BSB": 2,
    "HWH-NDLS": 3,
    "NDLS-RKMP": 4,
    "SBC-NDLS": 5,
    "MAS-MYS": 6,
}


def _stable_code(val: Any, mapping: Dict[str, int], modulo: int = 50) -> int:
    key = str(val).strip().upper()
    if key in mapping:
        return mapping[key]
    return (sum(ord(c) for c in key) % modulo) + 1


def engineer_features_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Produces a DataFrame with exact `MODEL_FEATURE_COLUMNS` in deterministic order.
    """
    feat = pd.DataFrame(index=df.index)
    feat["current_delay"] = df["current_delay"].astype(float)
    feat["current_speed"] = df["current_speed"].astype(float)
    feat["distance_to_next_station"] = df["distance_to_next_station"].astype(float)
    feat["distance_to_destination"] = df["distance_to_destination"].astype(float)
    feat["historical_section_running_time"] = df["historical_section_running_time"].astype(float)
    feat["historical_average_delay"] = df["historical_average_delay"].astype(float)

    feat["train_encoded"] = [
        _stable_code(v, TRAIN_ENCODING_MAP, 20) for v in df["train"]
    ]
    feat["station_encoded"] = [
        _stable_code(v, STATION_ENCODING_MAP, 60) for v in df["station"]
    ]
    feat["route_encoded"] = [
        _stable_code(v, ROUTE_ENCODING_MAP, 20) for v in df["route"]
    ]

    feat["day_of_week"] = df["day_of_week"].astype(int)
    feat["hour"] = df["hour"].astype(int)
    feat["weather"] = df["weather"].astype(float)
    feat["congestion"] = df["congestion"].astype(float)
    feat["previous_station_delay"] = df["previous_station_delay"].astype(float)

    return feat[MODEL_FEATURE_COLUMNS]


def build_single_feature_vector(payload: Dict[str, Any]) -> np.ndarray:
    """
    Converts a single telemetry dictionary into a (1, 14) numpy array for real-time inference.
    """
    row_df = pd.DataFrame(
        [
            {
                "current_delay": float(payload.get("current_delay", 0.0)),
                "current_speed": float(payload.get("current_speed", 95.0)),
                "distance_to_next_station": float(payload.get("distance_to_next_station", 60.0)),
                "distance_to_destination": float(payload.get("distance_to_destination", 250.0)),
                "historical_section_running_time": float(
                    payload.get("historical_section_running_time", 110.0)
                ),
                "historical_average_delay": float(payload.get("historical_average_delay", 9.0)),
                "train": str(payload.get("train", "12951")),
                "station": str(payload.get("station", "KOTA")),
                "route": str(payload.get("route", "MMCT-NDLS")),
                "day_of_week": int(payload.get("day_of_week", 1)),
                "hour": int(payload.get("hour", 18)),
                "weather": float(payload.get("weather", 0.1)),
                "congestion": float(payload.get("congestion", 0.25)),
                "previous_station_delay": float(
                    payload.get("previous_station_delay", payload.get("current_delay", 0.0))
                ),
            }
        ]
    )
    engineered = engineer_features_dataframe(row_df)
    return engineered.to_numpy(dtype=float)
