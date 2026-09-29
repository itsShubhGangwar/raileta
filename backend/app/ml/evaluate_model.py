"""
Evaluation Module for RailETA ML Pipeline.
------------------------------------------
Compares the trained HistGradientBoostingRegressor against the baseline:
    baseline_eta = scheduled_eta + current_delay
on a chronological time-based train/validation/test split using:
    - MAE (Mean Absolute Error)
    - RMSE (Root Mean Squared Error)
    - Median Absolute Error
    - P90 Absolute Error (90th percentile absolute error)

All metrics are computed strictly on evaluated splits of the deterministic
simulated dataset (`SIMULATED_DEMO_DATA (seed=42)`).
"""

from typing import Any, Dict
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, median_absolute_error


def compute_error_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """
    Computes MAE, RMSE, Median Absolute Error, and P90 Absolute Error in minutes.
    """
    abs_errors = np.abs(y_true - y_pred)
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    med_ae = float(median_absolute_error(y_true, y_pred))
    p90_ae = float(np.percentile(abs_errors, 90))

    return {
        "mae_minutes": round(mae, 3),
        "rmse_minutes": round(rmse, 3),
        "median_ae_minutes": round(med_ae, 3),
        "p90_ae_minutes": round(p90_ae, 3),
    }


def evaluate_model_vs_baseline(
    y_true: np.ndarray,
    ml_pred_delay: np.ndarray,
    current_delay_baseline: np.ndarray,
    split_name: str = "test",
) -> Dict[str, Any]:
    """
    Evaluates ML predicted arrival delay against the persistence baseline:
        baseline_eta = scheduled_eta + current_delay
    (where baseline predicted arrival delay equals `current_delay`).
    """
    baseline_metrics = compute_error_metrics(y_true, current_delay_baseline)
    ml_metrics = compute_error_metrics(y_true, ml_pred_delay)

    mae_improvement_pct = (
        ((baseline_metrics["mae_minutes"] - ml_metrics["mae_minutes"]) / baseline_metrics["mae_minutes"])
        * 100.0
        if baseline_metrics["mae_minutes"] > 0
        else 0.0
    )
    rmse_improvement_pct = (
        ((baseline_metrics["rmse_minutes"] - ml_metrics["rmse_minutes"]) / baseline_metrics["rmse_minutes"])
        * 100.0
        if baseline_metrics["rmse_minutes"] > 0
        else 0.0
    )

    return {
        "split": split_name,
        "samples": int(len(y_true)),
        "baseline_formula": "baseline_eta = scheduled_eta + current_delay",
        "baseline_metrics": baseline_metrics,
        "ml_model_metrics": ml_metrics,
        "improvement_over_baseline": {
            "mae_reduction_pct": round(mae_improvement_pct, 2),
            "rmse_reduction_pct": round(rmse_improvement_pct, 2),
            "mae_saved_minutes": round(
                baseline_metrics["mae_minutes"] - ml_metrics["mae_minutes"], 3
            ),
        },
    }
