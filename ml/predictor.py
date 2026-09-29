"""
RailETA Real-Time Inference Engine
----------------------------------
Loads the trained Gradient Boosting model bundle via joblib and computes
station-level predicted arrival time, prediction interval, and confidence.
"""

from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional
import joblib
import numpy as np

MODEL_PATH = Path(__file__).resolve().parent / "models" / "raileta_gbdt_v1.joblib"


def add_minutes_to_hhmm(hhmm: str, minutes_to_add: int) -> str:
    """Adds minutes to an HH:MM string and returns wrapped 24h HH:MM string."""
    try:
        parts = hhmm.strip().split(":")
        base = datetime(2026, 1, 1, int(parts[0]) % 24, int(parts[1]) % 60)
        shifted = base + timedelta(minutes=int(round(minutes_to_add)))
        return shifted.strftime("%H:%M")
    except Exception:
        return hhmm


class ETAPredictor:
    def __init__(self):
        self.bundle: Optional[Dict[str, Any]] = None
        self._load_or_init()

    def _load_or_init(self):
        if MODEL_PATH.exists():
            try:
                self.bundle = joblib.load(MODEL_PATH)
            except Exception as exc:
                print(f"[RailETA ML] Warning loading model artifact: {exc}")
                self.bundle = None

    def predict_station_eta(
        self,
        scheduled_arrival: str,
        current_delay_mins: float,
        distance_remaining_km: float,
        current_speed_kmph: float,
        scheduled_section_speed_kmph: float = 85.0,
        historical_station_delay_mins: float = 8.0,
        congestion_index: float = 0.25,
        weather_severity: float = 0.1,
        hour_of_day: int = 14,
        train_priority_tier: int = 1,
        stops_remaining: int = 3,
    ) -> Dict[str, Any]:
        features = np.array(
            [
                [
                    float(current_delay_mins),
                    float(distance_remaining_km),
                    float(current_speed_kmph),
                    float(scheduled_section_speed_kmph),
                    float(historical_station_delay_mins),
                    float(congestion_index),
                    float(weather_severity),
                    int(hour_of_day),
                    int(train_priority_tier),
                    int(stops_remaining),
                ]
            ]
        )

        if self.bundle is not None:
            point_delay = float(self.bundle["point_model"].predict(features)[0])
            lower_delay = float(self.bundle["lower_model"].predict(features)[0])
            upper_delay = float(self.bundle["upper_model"].predict(features)[0])
            model_version = self.bundle.get("version", "1.2.0-gbdt")
        else:
            # Deterministic physics-informed fallback if joblib artifact is not yet built
            recovery = (distance_remaining_km / 100.0) * (4.0 if train_priority_tier == 1 else 2.2) * (1.0 - congestion_index)
            enroute_penalty = (distance_remaining_km / 100.0) * (12.0 * congestion_index + 15.0 * weather_severity)
            point_delay = 0.78 * current_delay_mins + 0.22 * historical_station_delay_mins - recovery + enroute_penalty
            spread = max(3.0, 2.5 + (distance_remaining_km / 140.0) * (1.0 + congestion_index + weather_severity))
            lower_delay = point_delay - spread
            upper_delay = point_delay + spread
            model_version = "1.2.0-hybrid-fallback"

        predicted_delay = int(round(max(-3.0, point_delay)))
        low_delay = int(round(max(-5.0, min(lower_delay, predicted_delay - 2))))
        high_delay = int(round(max(predicted_delay + 3, upper_delay)))

        predicted_eta = add_minutes_to_hhmm(scheduled_arrival, predicted_delay)
        range_start = add_minutes_to_hhmm(scheduled_arrival, low_delay)
        range_end = add_minutes_to_hhmm(scheduled_arrival, high_delay)

        interval_width = max(4, high_delay - low_delay)
        raw_confidence = 96.0 - (interval_width * 0.85) - (distance_remaining_km * 0.012) - (congestion_index * 8.0) - (weather_severity * 7.0)
        confidence = int(round(np.clip(raw_confidence, 68.0, 97.0)))

        return {
            "scheduled_arrival": scheduled_arrival,
            "predicted_eta": predicted_eta,
            "predicted_delay_mins": predicted_delay,
            "prediction_range": f"{range_start} - {range_end}",
            "prediction_range_start": range_start,
            "prediction_range_end": range_end,
            "confidence": confidence,
            "model_version": model_version,
            "factors": {
                "slack_recovery_mins": round(max(0.0, current_delay_mins - predicted_delay), 1),
                "congestion_impact_mins": round(congestion_index * 6.5, 1),
                "weather_impact_mins": round(weather_severity * 5.0, 1),
                "historical_weight": 0.22,
            },
        }


predictor_instance = ETAPredictor()
