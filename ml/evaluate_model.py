"""
Root ML Evaluation Script (`ml/evaluate_model.py`).
Runs or loads the time-based evaluation comparing HistGradientBoostingRegressor
against `baseline_eta = scheduled_eta + current_delay` using:
  - MAE
  - RMSE
  - Median Absolute Error
  - P90 Absolute Error
"""

import json
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.ml.prediction_service import prediction_service


def run_evaluation():
    report = prediction_service.get_evaluation_report()
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    run_evaluation()
