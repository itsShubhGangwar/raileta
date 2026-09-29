"""
Data Preprocessing Module for RailETA ML Pipeline.
Handles validation, missing value imputation, physical range clipping,
and chronological sorting for time-based train/validation/test splitting.
"""

from typing import Any, Dict, List, Tuple
import numpy as np
import pandas as pd

RAW_REQUIRED_COLUMNS = [
    "date",
    "train",
    "station",
    "route",
    "current_delay",
    "current_speed",
    "distance_to_next_station",
    "distance_to_destination",
    "historical_section_running_time",
    "historical_average_delay",
    "day_of_week",
    "hour",
    "weather",
    "congestion",
    "previous_station_delay",
    "actual_arrival_delay",
]


def preprocess_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Cleans and validates raw operational records (from DB or demo generator),
    clips physically impossible values, imputes missing values, and sorts
    chronologically by `date` and `hour`.
    """
    cleaned = df.copy()

    # Fill defaults if any optional columns are missing
    defaults: Dict[str, Any] = {
        "date": "2026-08-01",
        "train": "12951",
        "station": "KOTA",
        "route": "MMCT-NDLS",
        "current_delay": 0.0,
        "current_speed": 90.0,
        "distance_to_next_station": 50.0,
        "distance_to_destination": 250.0,
        "historical_section_running_time": 90.0,
        "historical_average_delay": 8.0,
        "day_of_week": 1,
        "hour": 12,
        "weather": 0.1,
        "congestion": 0.25,
        "previous_station_delay": 0.0,
        "actual_arrival_delay": 0.0,
    }

    for col, default_val in defaults.items():
        if col not in cleaned.columns:
            cleaned[col] = default_val
        else:
            cleaned[col] = cleaned[col].fillna(default_val)

    # Clip numeric features to realistic physical bounds
    cleaned["current_delay"] = np.clip(cleaned["current_delay"].astype(float), -15.0, 360.0)
    cleaned["previous_station_delay"] = np.clip(
        cleaned["previous_station_delay"].astype(float), -15.0, 360.0
    )
    cleaned["current_speed"] = np.clip(cleaned["current_speed"].astype(float), 5.0, 160.0)
    cleaned["distance_to_next_station"] = np.clip(
        cleaned["distance_to_next_station"].astype(float), 1.0, 1000.0
    )
    cleaned["distance_to_destination"] = np.clip(
        cleaned["distance_to_destination"].astype(float), 1.0, 3000.0
    )
    cleaned["historical_section_running_time"] = np.clip(
        cleaned["historical_section_running_time"].astype(float), 5.0, 1200.0
    )
    cleaned["historical_average_delay"] = np.clip(
        cleaned["historical_average_delay"].astype(float), 0.0, 240.0
    )
    cleaned["day_of_week"] = np.clip(cleaned["day_of_week"].astype(int), 0, 6)
    cleaned["hour"] = np.clip(cleaned["hour"].astype(int), 0, 23)
    cleaned["weather"] = np.clip(cleaned["weather"].astype(float), 0.0, 1.0)
    cleaned["congestion"] = np.clip(cleaned["congestion"].astype(float), 0.0, 1.0)

    if "actual_arrival_delay" in cleaned.columns:
        cleaned["actual_arrival_delay"] = np.clip(
            cleaned["actual_arrival_delay"].astype(float), -15.0, 360.0
        )

    # Sort chronologically for strict time-based splitting
    cleaned = cleaned.sort_values(by=["date", "hour"]).reset_index(drop=True)
    return cleaned


def time_based_split(
    df: pd.DataFrame,
    train_Frac: float = 0.70,
    val_frac: float = 0.15,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Splits a chronologically sorted DataFrame into Train (earliest 70%),
    Validation (next 15%), and Test (most recent 15%) sets without data leakage.
    """
    sorted_df = preprocess_dataframe(df)
    n = len(sorted_df)
    train_end = int(n * train_Frac)
    val_end = int(n * (train_Frac + val_frac))

    train_df = sorted_df.iloc[:train_end].copy()
    val_df = sorted_df.iloc[train_end:val_end].copy()
    test_df = sorted_df.iloc[val_end:].copy()

    return train_df, val_df, test_df
