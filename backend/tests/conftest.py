import os
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Disable background infinite loop, use isolated test DB and test model artifact, and ensure clean initial database
os.environ["DATABASE_URL"] = "sqlite:///./test_raileta.db"
os.environ["MODEL_PATH"] = "app/ml/artifacts/test_raileta_hgb_model.joblib"
os.environ["ENABLE_SIMULATOR"] = "false"
os.environ["SEED_DEMO_DATA"] = "false"

from app.database import Base, engine
from app.main import app, initialize_system


@pytest.fixture(scope="session", autouse=True)
def setup_database_and_ml():
    # Start test session with a clean database containing ONLY the demo user
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    initialize_system()
    yield
    # Leave database in clean initial state (only demo user, 0 railway data) after test suite finishes
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    initialize_system()
    test_model = BACKEND_ROOT / "app" / "ml" / "artifacts" / "test_raileta_hgb_model.joblib"
    if test_model.exists():
        test_model.unlink()


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client
