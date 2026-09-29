"""
Prediction Service for RailETA ML Pipeline.
Loads the joblib-serialized HistGradientBoostingRegressor bundle, serves
real-time station ETA predictions, P10-P90 uncertainty bounds, and baseline comparisons,
and supports explicit authenticated retraining from PostgreSQL `historical_runs`.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sqlalchemy.orm import Session

from app.ml.evaluate_model import evaluate_model_vs_baseline
from app.ml.feature_engineering import (
    MODEL_FEATURE_COLUMNS,
    build_single_feature_vector,
    engineer_features_dataframe,
)
from app.ml.preprocessing import time_based_split
from app.ml.train_model import get_model_path, train_and_evaluate_pipeline
from app.models.railway import HistoricalRun
from app.services.data_generator import (
    DEMO_DATA_LABEL,
    DETERMINISTIC_SEED,
    add_minutes_to_hhmm,
    generate_historical_training_dataframe,
)


class PredictionService:
    def __init__(self):
        self.bundle: Optional[Dict[str, Any]] = None
        self.ensure_loaded()

    def ensure_loaded(self) -> None:
        import sklearn

        model_path = get_model_path()
        if not model_path.exists():
            train_and_evaluate_pipeline(save_path=model_path)
        try:
            loaded = joblib.load(model_path)
            if loaded.get("sklearn_version") != sklearn.__version__:
                train_and_evaluate_pipeline(save_path=model_path)
                loaded = joblib.load(model_path)
            self.bundle = loaded
        except Exception as exc:
            print(f"[RailETA ML] Rebuilding model artifact after load error: {exc}")
            train_and_evaluate_pipeline(save_path=model_path)
            self.bundle = joblib.load(model_path)

    def get_evaluation_report(self) -> Dict[str, Any]:
        self.ensure_loaded()
        if self.bundle and "evaluation_report" in self.bundle:
            return self.bundle["evaluation_report"]
        return {}

    def retrain_from_database(self, db: Session, min_records: int = 10) -> Dict[str, Any]:
        """
        Explicitly retrains the HistGradientBoostingRegressor ensemble using
        labeled historical runs stored in PostgreSQL `historical_runs`.
        Raises ValueError with a clear explanation if labeled data is insufficient.
        """
        db_runs: List[HistoricalRun] = db.query(HistoricalRun).all()
        if len(db_runs) < min_records:
            raise ValueError(
                f"Insufficient historical records for retraining (found {len(db_runs)}, "
                f"minimum {min_records} required). Upload sufficient historical runs and click RETRAIN MODEL."
            )

        rows = []
        for hr in db_runs:
            t_no = hr.train.train_number if hr.train else "12951"
            st_code = hr.station.code if hr.station else "KOTA"
            route_str = (
                f"{hr.train.source}-{hr.train.destination}"
                if hr.train
                else "MMCT-NDLS"
            )
            rows.append(
                {
                    "date": hr.date or "2026-06-15",
                    "train": t_no,
                    "station": st_code,
                    "route": route_str,
                    "sequence": int(hr.sequence or 3),
                    "scheduled_arrival": hr.scheduled_arrival or "18:30",
                    "actual_arrival": hr.actual_arrival or "18:42",
                    "current_delay": float(hr.current_delay if hr.current_delay is not None else hr.delay_minutes),
                    "current_speed": float(hr.current_speed or 100.0),
                    "distance_to_next_station": float(hr.distance_to_next_station or 65.0),
                    "distance_to_destination": float(hr.distance_to_destination or 250.0),
                    "historical_section_running_time": float(
                        hr.historical_section_running_time or hr.running_time or 120.0
                    ),
                    "historical_average_delay": float(
                        hr.historical_average_delay
                        if hr.historical_average_delay is not None
                        else max(0.0, hr.delay_minutes * 0.85)
                    ),
                    "day_of_week": int(hr.day_of_week or 1),
                    "hour": int(hr.hour or 14),
                    "weather": float(hr.weather or 0.1),
                    "congestion": float(hr.congestion or 0.25),
                    "previous_station_delay": float(
                        hr.previous_station_delay
                        if hr.previous_station_delay is not None
                        else hr.delay_minutes
                    ),
                    "actual_arrival_delay": float(hr.delay_minutes),
                    "remaining_travel_time": float(hr.running_time or 120.0),
                    "data_source": "Uploaded Dataset",
                }
            )

        db_df = pd.DataFrame(rows)
        # Ensure enough rows for HistGradientBoosting tree splits when user uploads a compact CSV (10-40 rows)
        if len(db_df) < 60:
            repeats = max(2, int(np.ceil(60 / len(db_df))))
            combined_df = pd.concat([db_df] * repeats, ignore_index=True)
        else:
            combined_df = db_df

        train_df, val_df, test_df = time_based_split(
            combined_df, train_Frac=0.70, val_frac=0.15
        )

        X_train = engineer_features_dataframe(train_df).to_numpy(dtype=float)
        y_train = train_df["actual_arrival_delay"].to_numpy(dtype=float)

        X_val = engineer_features_dataframe(val_df).to_numpy(dtype=float)
        y_val = val_df["actual_arrival_delay"].to_numpy(dtype=float)

        X_test = engineer_features_dataframe(test_df).to_numpy(dtype=float)
        y_test = test_df["actual_arrival_delay"].to_numpy(dtype=float)

        categorical_indices = [6, 7, 8, 9]

        point_model = HistGradientBoostingRegressor(
            loss="squared_error",
            max_iter=220,
            max_depth=6,
            learning_rate=0.06,
            l2_regularization=1.2,
            categorical_features=categorical_indices,
            random_state=DETERMINISTIC_SEED,
        )
        point_model.fit(X_train, y_train)

        lower_model = HistGradientBoostingRegressor(
            loss="quantile",
            quantile=0.10,
            max_iter=160,
            max_depth=5,
            learning_rate=0.07,
            categorical_features=categorical_indices,
            random_state=DETERMINISTIC_SEED,
        )
        lower_model.fit(X_train, y_train)

        upper_model = HistGradientBoostingRegressor(
            loss="quantile",
            quantile=0.90,
            max_iter=160,
            max_depth=5,
            learning_rate=0.07,
            categorical_features=categorical_indices,
            random_state=DETERMINISTIC_SEED,
        )
        upper_model.fit(X_train, y_train)

        val_preds = point_model.predict(X_val)
        val_baseline = val_df["current_delay"].to_numpy(dtype=float)
        val_eval = evaluate_model_vs_baseline(
            y_val, val_preds, val_baseline, split_name="validation"
        )

        test_preds = point_model.predict(X_test)
        test_baseline = test_df["current_delay"].to_numpy(dtype=float)
        test_eval = evaluate_model_vs_baseline(
            y_test, test_preds, test_baseline, split_name="test"
        )

        import sklearn

        now_iso = datetime.utcnow().isoformat() + "Z"
        evaluation_report = {
            "model_name": "HistGradientBoostingRegressor (Point + P10/P90 Quantile Ensemble)",
            "model_version": "2.1.0-hgb-retrained",
            "data_source": "Uploaded Dataset",
            "db_records_used": len(db_runs),
            "total_training_samples": len(combined_df),
            "split_strategy": "Chronological Time-Based Split (70% Train / 15% Validation / 15% Test)",
            "features": MODEL_FEATURE_COLUMNS,
            "validation_evaluation": val_eval,
            "test_evaluation": test_eval,
            "trained_at": now_iso,
        }

        bundle = {
            "model_version": "2.1.0-hgb-retrained",
            "sklearn_version": sklearn.__version__,
            "data_source": "Uploaded Dataset",
            "feature_columns": MODEL_FEATURE_COLUMNS,
            "point_model": point_model,
            "lower_model": lower_model,
            "upper_model": upper_model,
            "evaluation_report": evaluation_report,
        }
        model_path = get_model_path()
        model_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(bundle, model_path)
        self.bundle = bundle
        return evaluation_report

    def predict_station_eta(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Computes ML predicted ETA, baseline ETA (`scheduled_eta + current_delay`),
        predicted delay, lower/upper quantile bounds, and confidence score.
        """
        self.ensure_loaded()
        X = build_single_feature_vector(payload)

        scheduled_eta = str(
            payload.get("scheduled_eta")
            or payload.get("scheduled_arrival")
            or "18:30"
        )
        current_delay = float(payload.get("current_delay", 0.0))
        dist_to_dest = float(payload.get("distance_to_destination", 200.0))
        current_speed = float(payload.get("current_speed", 100.0))
        weather = float(payload.get("weather", 0.1))
        congestion = float(payload.get("congestion", 0.25))

        # Baseline: baseline_eta = scheduled_eta + current_delay
        baseline_delay = round(current_delay, 1)
        baseline_eta = add_minutes_to_hhmm(scheduled_eta, baseline_delay)

        assert self.bundle is not None
        point_delay = float(self.bundle["point_model"].predict(X)[0])
        lower_delay = float(self.bundle["lower_model"].predict(X)[0])
        upper_delay = float(self.bundle["upper_model"].predict(X)[0])

        predicted_delay = round(max(-10.0, point_delay), 1)
        low_delay = round(min(lower_delay, predicted_delay - 2.5), 1)
        high_delay = round(max(upper_delay, predicted_delay + 2.5), 1)

        predicted_eta = add_minutes_to_hhmm(scheduled_eta, predicted_delay)
        lower_bound = add_minutes_to_hhmm(scheduled_eta, low_delay)
        upper_bound = add_minutes_to_hhmm(scheduled_eta, high_delay)

        # Confidence derived from P10-P90 quantile spread and remaining distance
        spread = max(3.0, high_delay - low_delay)
        raw_conf = (
            96.0
            - (spread * 0.72)
            - (dist_to_dest * 0.008)
            - (congestion * 6.0)
            - (weather * 5.0)
        )
        confidence = int(round(float(np.clip(raw_conf, 68.0, 98.0))))

        scheduled_remaining_mins = (dist_to_dest / max(45.0, current_speed)) * 60.0
        remaining_travel_time_mins = round(
            max(3.0, scheduled_remaining_mins + (predicted_delay - current_delay)), 1
        )

        return {
            "train_number": str(payload.get("train", "12951")),
            "station_code": str(payload.get("station", "KOTA")),
            "scheduled_eta": scheduled_eta,
            "scheduled_arrival": scheduled_eta,
            "baseline_eta": baseline_eta,
            "baseline_delay": baseline_delay,
            "predicted_eta": predicted_eta,
            "predicted_delay": predicted_delay,
            "predicted_delay_mins": int(round(predicted_delay)),
            "lower_bound": lower_bound,
            "upper_bound": upper_bound,
            "prediction_range": f"{lower_bound} - {upper_bound}",
            "prediction_range_start": lower_bound,
            "prediction_range_end": upper_bound,
            "confidence": confidence,
            "remaining_travel_time_mins": remaining_travel_time_mins,
            "model_version": self.bundle.get("model_version", "2.0.0-hgb"),
            "data_source": DEMO_DATA_LABEL,
            "factors": {
                "slack_recovery_mins": round(max(0.0, current_delay - predicted_delay), 1),
                "congestion_impact_mins": round(congestion * 6.5, 1),
                "weather_impact_mins": round(weather * 5.0, 1),
                "historical_weight": 0.20,
            },
        }


prediction_service = PredictionService()
