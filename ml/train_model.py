"""
Root ML Training Entrypoint (`ml/train_model.py`).
Delegates to `backend/app/ml/train_model.py` so the 14-feature
HistGradientBoostingRegressor pipeline can be invoked from either root or backend.
"""

import json
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.ml.train_model import train_and_evaluate_pipeline

if __name__ == "__main__":
    report = train_and_evaluate_pipeline()
    root_models_dir = Path(__file__).resolve().parent / "models"
    root_models_dir.mkdir(parents=True, exist_ok=True)
    with open(root_models_dir / "evaluation_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
