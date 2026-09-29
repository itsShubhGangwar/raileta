"""
Training Script for RailETA ML Pipeline.
----------------------------------------
1. Generates or loads chronological historical run records (SIMULATED_DEMO_DATA, seed=42)
2. Preprocesses and performs a strict time-based train/validation/test split
3. Engineers the 14 required operational features
4. Trains a HistGradientBoostingRegressor ensemble (point + P10/P90 quantile bounds)
5. Evaluates the model against `baseline_eta = scheduled_eta + current_delay`
   using MAE, RMSE, Median AE, and P90 AE
6. Serializes the model bundle with joblib to MODEL_PATH
"""

from datetime import datetime
import json
import os
from pathlib import Path
from typing import Any, Dict

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

from app.ml.evaluate_model import evaluate_model_vs_baseline
from app.ml.feature_engineering import MODEL_FEATURE_COLUMNS, engineer_features_dataframe
from app.ml.preprocessing import time_based_split
from app.services.data_generator import (
    DEMO_DATA_LABEL,
    DETERMINISTIC_SEED,
    generate_historical_training_dataframe,
)

DEFAULT_ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"
DEFAULT_MODEL_PATH = DEFAULT_ARTIFACT_DIR / "raileta_hgb_model.joblib"
DEFAULT_EVAL_REPORT_PATH = DEFAULT_ARTIFACT_DIR / "evaluation_report.json"


def get_model_path() -> Path:
    env_path = os.getenv("MODEL_PATH", "")
    if env_path:
        p = Path(env_path)
        if not p.is_absolute():
            # Resolve relative to backend root
            backend_root = Path(__file__).resolve().parent.parent.parent
            return backend_root / p
        return p
    return DEFAULT_MODEL_PATH


def train_and_evaluate_pipeline(save_path: Path | None = None) -> Dict[str, Any]:
    target_model_path = save_path or get_model_path()
    target_model_path.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Generate deterministic chronological dataset (SIMULATED_DEMO_DATA, seed=42)
    raw_df = generate_historical_training_dataframe(
        n_days=90, samples_per_day=60, seed=DETERMINISTIC_SEED
    )

    # 2. Time-based split: 70% Train (earliest), 15% Validation (middle), 15% Test (latest)
    train_df, val_df, test_df = time_based_split(raw_df, train_Frac=0.70, val_frac=0.15)

    # 3. Feature Engineering (14 features)
    X_train = engineer_features_dataframe(train_df).to_numpy(dtype=float)
    y_train = train_df["actual_arrival_delay"].to_numpy(dtype=float)

    X_val = engineer_features_dataframe(val_df).to_numpy(dtype=float)
    y_val = val_df["actual_arrival_delay"].to_numpy(dtype=float)

    X_test = engineer_features_dataframe(test_df).to_numpy(dtype=float)
    y_test = test_df["actual_arrival_delay"].to_numpy(dtype=float)

    # Categorical feature indices in MODEL_FEATURE_COLUMNS:
    # index 6 = train_encoded, 7 = station_encoded, 8 = route_encoded, 9 = day_of_week
    categorical_indices = [6, 7, 8, 9]

    # 4. Fit Tree-Based Regression Models (HistGradientBoostingRegressor)
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

    # 5. Evaluate on Validation and Test sets against baseline_eta = scheduled_eta + current_delay
    val_preds = point_model.predict(X_val)
    val_baseline = val_df["current_delay"].to_numpy(dtype=float)
    val_eval = evaluate_model_vs_baseline(y_val, val_preds, val_baseline, split_name="validation")

    test_preds = point_model.predict(X_test)
    test_baseline = test_df["current_delay"].to_numpy(dtype=float)
    test_eval = evaluate_model_vs_baseline(y_test, test_preds, test_baseline, split_name="test")

    evaluation_report = {
        "model_name": "HistGradientBoostingRegressor (Point + P10/P90 Quantile Ensemble)",
        "model_version": "2.0.0-hgb",
        "data_source": DEMO_DATA_LABEL,
        "data_disclaimer": (
            "Evaluated on deterministic simulated railway telemetry (seed=42). "
            "Does not claim real Indian Railways production performance."
        ),
        "split_strategy": "Chronological Time-Based Split (70% Train / 15% Validation / 15% Test)",
        "date_ranges": {
            "train": f"{train_df['date'].min()} to {train_df['date'].max()} ({len(train_df)} runs)",
            "validation": f"{val_df['date'].min()} to {val_df['date'].max()} ({len(val_df)} runs)",
            "test": f"{test_df['date'].min()} to {test_df['date'].max()} ({len(test_df)} runs)",
        },
        "features": MODEL_FEATURE_COLUMNS,
        "validation_evaluation": val_eval,
        "test_evaluation": test_eval,
        "trained_at": datetime.utcnow().isoformat() + "Z",
    }

    # 6. Serialize with joblib
    import sklearn

    bundle = {
        "model_version": "2.0.0-hgb",
        "sklearn_version": sklearn.__version__,
        "data_source": DEMO_DATA_LABEL,
        "feature_columns": MODEL_FEATURE_COLUMNS,
        "point_model": point_model,
        "lower_model": lower_model,
        "upper_model": upper_model,
        "evaluation_report": evaluation_report,
    }
    joblib.dump(bundle, target_model_path)

    with open(DEFAULT_EVAL_REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(evaluation_report, f, indent=2)

    print(f"[RailETA ML] Model serialized to: {target_model_path}")
    print(
        f"[RailETA ML] Test Split Evaluation ({DEMO_DATA_LABEL}):\n"
        f"  Baseline (scheduled_eta + current_delay) -> "
        f"MAE: {test_eval['baseline_metrics']['mae_minutes']}m | "
        f"RMSE: {test_eval['baseline_metrics']['rmse_minutes']}m | "
        f"MedAE: {test_eval['baseline_metrics']['median_ae_minutes']}m | "
        f"P90: {test_eval['baseline_metrics']['p90_ae_minutes']}m\n"
        f"  HistGradientBoostingRegressor            -> "
        f"MAE: {test_eval['ml_model_metrics']['mae_minutes']}m | "
        f"RMSE: {test_eval['ml_model_metrics']['rmse_minutes']}m | "
        f"MedAE: {test_eval['ml_model_metrics']['median_ae_minutes']}m | "
        f"P90: {test_eval['ml_model_metrics']['p90_ae_minutes']}m"
    )
    return evaluation_report


if __name__ == "__main__":
    train_and_evaluate_pipeline()
