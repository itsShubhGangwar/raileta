"""
Comprehensive Backend, Clean Initial Database, Dataset Upload Workflow,
Telemetry, Map, WebSocket & ML Test Suite for RailETA.

Verifies all 14 Section 18 requirements:
1. Fresh database has only demo user and 0 trains/stations/routes
2. Empty database search returns empty list []
3. Missing train returns 404
4. Uploading stations.csv works
5. Uploading trains.csv works
6. Uploading routes.csv works
7. Uploading historical_runs.csv works
8. Uploading weather.csv works
9. Uploading telemetry.csv works
10. Uploaded trains appear in search
11. Uploaded route appears on map
12. Manual telemetry updates prediction
13. Telemetry playback works
14. ML retrain fails cleanly when historical data is insufficient and succeeds when historical data is uploaded
"""

import io
from app.database import SessionLocal, get_database_backend_name
from app.ml.prediction_service import prediction_service
from app.models.railway import (
    Dataset,
    HistoricalRun,
    Prediction,
    Route,
    Station,
    TelemetryRecord,
    Train,
    TrainPosition,
    User,
    WeatherRecord,
)
from app.services.auth_service import get_demo_credentials
from app.services.ingestion_service import seed_all_tables_if_empty
from app.services.telemetry_providers import interpolate_route_position

DEMO_USERNAME, DEMO_PASSWORD = get_demo_credentials()


def _get_auth_headers(client) -> dict:
    res = client.post(
        "/api/auth/login",
        json={"username": DEMO_USERNAME, "password": DEMO_PASSWORD},
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ==========================================
# 1. CLEAN INITIAL DATABASE & EMPTY STATE TESTS
# ==========================================

def test_01_fresh_database_has_only_demo_user_and_zero_railway_data(client):
    """
    Requirement 1: Fresh database has only demo user and 0 trains/stations/routes/historical/weather/telemetry.
    """
    backend_name = get_database_backend_name()
    assert backend_name in ("postgresql", "sqlite", "PostgreSQL", "SQLite (local fallback)")

    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "HistGradientBoostingRegressor" in data["ml_model"]

    stats = data["database_stats"]
    assert stats["users"] == 1
    assert stats["trains"] == 0
    assert stats["stations"] == 0
    assert stats["routes"] == 0
    assert stats["historical_runs"] == 0
    assert stats["weather_records"] == 0
    assert stats["telemetry_records"] == 0
    assert stats["train_positions"] == 0
    assert stats["predictions"] == 0
    assert stats["datasets"] == 0

    # Verify idempotent seeding does NOT create railway data or duplicate demo user
    db = SessionLocal()
    try:
        seed_all_tables_if_empty(db)
        assert db.query(User).count() == 1
        assert db.query(Train).count() == 0
        assert db.query(Station).count() == 0
        assert db.query(Route).count() == 0
        assert db.query(HistoricalRun).count() == 0
        assert db.query(WeatherRecord).count() == 0
        assert db.query(TelemetryRecord).count() == 0
        assert db.query(TrainPosition).count() == 0
        assert db.query(Prediction).count() == 0
        assert db.query(Dataset).count() == 0
    finally:
        db.close()


def test_02_empty_database_search_returns_empty_list(client):
    """
    Requirement 2: Empty database search returns empty list [].
    """
    res_all = client.get("/api/trains")
    assert res_all.status_code == 200
    assert res_all.json() == []

    res_search = client.get("/api/trains/search?q=12951")
    assert res_search.status_code == 200
    assert res_search.json() == []


def test_03_missing_train_returns_404_and_empty_telemetry_errors_cleanly(client):
    """
    Requirement 3: Missing train returns 404, and Manual Telemetry / Playback handle empty DB cleanly.
    """
    for endpoint in [
        "/api/trains/12951",
        "/api/trains/12951/status",
        "/api/trains/12951/eta",
        "/api/trains/12951/route",
        "/api/trains/12951/analytics",
        "/api/trains/999999",
    ]:
        res = client.get(endpoint)
        assert res.status_code == 404
        detail = res.json()["detail"]
        assert "not available in the current dataset" in detail or "not found" in detail.lower()

    # Manual telemetry when no trains exist
    headers = _get_auth_headers(client)
    res_manual = client.post(
        "/api/telemetry/update",
        headers=headers,
        json={"train_number": "12951", "speed": 110.0, "delay": 10.0},
    )
    assert res_manual.status_code == 400
    assert "Upload train data before using Manual Telemetry" in res_manual.json()["detail"]

    # Telemetry playback when no telemetry records exist
    res_playback = client.post(
        "/api/telemetry/playback",
        headers=headers,
        json={"action": "step", "train_number": "12951", "speed_multiplier": 1},
    )
    assert res_playback.status_code == 400
    assert "No telemetry data available. Upload telemetry.csv first." in res_playback.json()["detail"]


def test_04_ml_retrain_fails_cleanly_when_historical_data_insufficient(client):
    """
    Requirement 14 (part 1): ML retrain fails cleanly when historical data is insufficient.
    """
    headers = _get_auth_headers(client)
    res_retrain = client.post("/api/ml/retrain", headers=headers)
    assert res_retrain.status_code == 400
    assert "Insufficient historical records for retraining" in res_retrain.json()["detail"]


# ==========================================
# 2. AUTHENTICATION TESTS
# ==========================================

def test_05_auth_demo_login_and_invalid_password(client):
    # 1. Valid demo user login succeeds
    res_ok = client.post(
        "/api/auth/login",
        json={"username": DEMO_USERNAME, "password": DEMO_PASSWORD},
    )
    assert res_ok.status_code == 200
    body = res_ok.json()
    assert "access_token" in body
    assert body["user"]["username"] == "demo"
    assert body["user"]["is_demo"] is True
    assert body["user"]["account_label"] == "Demo Account"

    # 2. Invalid password fails with 401
    res_bad = client.post(
        "/api/auth/login",
        json={"username": DEMO_USERNAME, "password": "WrongPassword123!"},
    )
    assert res_bad.status_code == 401

    # 3. Protected endpoint without token is rejected (401)
    res_no_token = client.get("/api/auth/me")
    assert res_no_token.status_code == 401

    res_upload_no_token = client.post(
        "/api/datasets/upload",
        data={"dataset_type": "stations"},
        files={"file": ("stations.csv", b"station_code,station_name,latitude,longitude\nTEST,Test,20.0,75.0", "text/csv")},
    )
    assert res_upload_no_token.status_code == 401

    # 4. Protected endpoint with valid token succeeds
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    res_me = client.get("/api/auth/me", headers=headers)
    assert res_me.status_code == 200
    assert res_me.json()["username"] == "demo"

    res_logout = client.post("/api/auth/logout", headers=headers)
    assert res_logout.status_code == 200


# ==========================================
# 3. STEP 1 TO STEP 6 CSV DATASET UPLOADS
# ==========================================

def test_06_step_1_to_6_dataset_uploads_and_dependency_validation(client):
    """
    Requirements 4, 5, 6, 7, 8, 9:
    4. Uploading stations.csv works
    5. Uploading trains.csv works
    6. Uploading routes.csv works
    7. Uploading historical_runs.csv works
    8. Uploading weather.csv works
    9. Uploading telemetry.csv works
    Also verifies relational dependency order and CSV error handling.
    """
    headers = _get_auth_headers(client)

    # Verify dependency enforcement: uploading trains.csv BEFORE stations.csv is rejected cleanly
    trains_tpl = client.get("/api/datasets/template/trains").text
    res_premature_trains = client.post(
        "/api/datasets/upload",
        headers=headers,
        data={"dataset_type": "trains"},
        files={"file": ("trains.csv", io.BytesIO(trains_tpl.encode("utf-8")), "text/csv")},
    )
    assert res_premature_trains.status_code == 400
    assert "Upload stations.csv first" in str(res_premature_trains.json()["detail"])

    # STEP 1: Upload stations.csv (Requirement 4)
    stations_csv = client.get("/api/datasets/template/stations").text
    res_stations = client.post(
        "/api/datasets/upload",
        headers=headers,
        data={"dataset_type": "stations", "name": "Step 1 Stations"},
        files={"file": ("stations.csv", io.BytesIO(stations_csv.encode("utf-8")), "text/csv")},
    )
    assert res_stations.status_code == 200
    assert res_stations.json()["status"] == "Ready"
    assert res_stations.json()["row_count"] >= 9

    # STEP 2: Upload trains.csv (Requirement 5)
    res_trains = client.post(
        "/api/datasets/upload",
        headers=headers,
        data={"dataset_type": "trains", "name": "Step 2 Trains"},
        files={"file": ("trains.csv", io.BytesIO(trains_tpl.encode("utf-8")), "text/csv")},
    )
    assert res_trains.status_code == 200
    assert res_trains.json()["status"] == "Ready"
    assert res_trains.json()["row_count"] >= 1

    # STEP 3: Upload routes.csv (Requirement 6)
    routes_csv = client.get("/api/datasets/template/routes").text
    res_routes = client.post(
        "/api/datasets/upload",
        headers=headers,
        data={"dataset_type": "routes", "name": "Step 3 Routes"},
        files={"file": ("routes.csv", io.BytesIO(routes_csv.encode("utf-8")), "text/csv")},
    )
    assert res_routes.status_code == 200
    assert res_routes.json()["status"] == "Ready"
    assert res_routes.json()["row_count"] >= 9

    # STEP 4: Upload historical_runs.csv (Requirement 7)
    historical_csv = client.get("/api/datasets/template/historical_runs").text
    res_hist = client.post(
        "/api/datasets/upload",
        headers=headers,
        data={"dataset_type": "historical_runs", "name": "Step 4 Historical Runs"},
        files={"file": ("historical_runs.csv", io.BytesIO(historical_csv.encode("utf-8")), "text/csv")},
    )
    assert res_hist.status_code == 200
    assert res_hist.json()["status"] == "Ready"
    assert res_hist.json()["row_count"] >= 10

    # STEP 5: Upload weather.csv (Requirement 8)
    weather_csv = client.get("/api/datasets/template/weather").text
    res_weather = client.post(
        "/api/datasets/upload",
        headers=headers,
        data={"dataset_type": "weather", "name": "Step 5 Weather"},
        files={"file": ("weather.csv", io.BytesIO(weather_csv.encode("utf-8")), "text/csv")},
    )
    assert res_weather.status_code == 200
    assert res_weather.json()["status"] == "Ready"
    assert res_weather.json()["row_count"] >= 2

    # STEP 6: Upload telemetry.csv (Requirement 9)
    telemetry_csv = client.get("/api/datasets/template/telemetry").text
    res_telemetry = client.post(
        "/api/datasets/upload",
        headers=headers,
        data={"dataset_type": "telemetry", "name": "Step 6 Telemetry"},
        files={"file": ("telemetry.csv", io.BytesIO(telemetry_csv.encode("utf-8")), "text/csv")},
    )
    assert res_telemetry.status_code == 200
    up_telemetry = res_telemetry.json()
    assert up_telemetry["status"] == "Ready"
    assert up_telemetry["row_count"] >= 3

    # Verify dataset retrieval endpoints
    res_list = client.get("/api/datasets")
    assert res_list.status_code == 200
    assert len(res_list.json()) == 6

    res_single = client.get(f"/api/datasets/{up_telemetry['id']}")
    assert res_single.status_code == 200
    assert res_single.json()["dataset_type"] == "telemetry"

    res_summary = client.get("/api/datasets/summary")
    assert res_summary.status_code == 200
    counts = res_summary.json()["table_counts"]
    assert counts["stations"] >= 9
    assert counts["trains"] >= 1
    assert counts["routes"] >= 9
    assert counts["historical_runs"] >= 10
    assert counts["weather_records"] >= 2
    assert counts["telemetry_records"] >= 3

    # Verify missing required columns error (400)
    missing_col_csv = "timestamp,temperature\n2026-09-29T18:00:00Z,25.0\n"
    res_missing = client.post(
        "/api/datasets/upload",
        headers=headers,
        data={"dataset_type": "weather"},
        files={"file": ("bad_cols.csv", io.BytesIO(missing_col_csv.encode("utf-8")), "text/csv")},
    )
    assert res_missing.status_code == 400
    assert "Missing required columns" in str(res_missing.json()["detail"])

    # Verify malformed / empty CSV error (400)
    res_empty = client.post(
        "/api/datasets/upload",
        headers=headers,
        data={"dataset_type": "weather"},
        files={"file": ("empty.csv", io.BytesIO(b"   \n  "), "text/csv")},
    )
    assert res_empty.status_code == 400


# ==========================================
# 4. SEARCH, ETA, MAP, MANUAL TELEMETRY, PLAYBACK & RETRAIN
# ==========================================

def test_07_uploaded_trains_appear_in_search_and_eta_endpoints(client):
    """
    Requirement 10: Uploaded trains appear in search and ETA endpoints work.
    """
    res_num = client.get("/api/trains/search?q=12951")
    assert res_num.status_code == 200
    items = res_num.json()
    assert len(items) == 1
    assert items[0]["train_number"] == "12951"
    assert items[0]["source"] == "MMCT"
    assert items[0]["destination"] == "NDLS"

    res_all = client.get("/api/trains")
    assert res_all.status_code == 200
    assert len(res_all.json()) >= 1

    res_eta = client.get("/api/trains/12951/eta")
    assert res_eta.status_code == 200
    data = res_eta.json()
    assert data["train"]["train_number"] == "12951"
    assert len(data["predictions"]) >= 9
    assert "Live Indian Railways" not in data["data_source"]

    kota_pred = next(p for p in data["predictions"] if p["station"]["code"] == "KOTA")
    for field in [
        "station",
        "scheduled_eta",
        "predicted_eta",
        "predicted_delay",
        "confidence",
        "lower_bound",
        "upper_bound",
    ]:
        assert field in kota_pred

    # Direct POST /api/predictions endpoint
    payload = {
        "train_number": "12951",
        "station_code": "KOTA",
        "scheduled_eta": "18:30",
        "current_delay": 18.0,
        "current_speed": 120.0,
        "distance_to_next_station": 85.0,
        "distance_to_destination": 240.0,
        "historical_section_running_time": 165.0,
        "historical_average_delay": 11.0,
        "day_of_week": 1,
        "hour": 18,
        "weather": 0.10,
        "congestion": 0.22,
        "previous_station_delay": 20.0,
    }
    res_pred = client.post("/api/predictions", json=payload)
    assert res_pred.status_code == 200
    pred_body = res_pred.json()
    assert pred_body["train_number"] == "12951"
    assert pred_body["station_code"] == "KOTA"
    assert 65 <= pred_body["confidence"] <= 99
    assert pred_body["data_source"] == "Uploaded Dataset"


def test_08_uploaded_route_appears_on_map_and_interpolates_coordinates(client):
    """
    Requirement 11: Uploaded route appears on map with valid coordinates and route interpolation.
    """
    res_route = client.get("/api/trains/12951/route")
    assert res_route.status_code == 200
    route_stops = res_route.json()["route"]
    assert len(route_stops) >= 9

    for stop in route_stops:
        lat = stop["lat"]
        lng = stop["lng"]
        assert lat is not None and lng is not None
        assert 6.0 <= lat <= 38.0
        assert 68.0 <= lng <= 98.0

    db = SessionLocal()
    try:
        train = db.query(Train).filter(Train.train_number == "12951").first()
        rtm_route = next(r for r in train.routes if r.station.code == "RTM")
        kota_route = next(r for r in train.routes if r.station.code == "KOTA")
        mid_distance_km = (rtm_route.distance_from_origin + kota_route.distance_from_origin) / 2.0

        interp = interpolate_route_position(
            train=train,
            distance_covered_km=mid_distance_km,
        )
        rtm = rtm_route.station
        kota = kota_route.station

        min_lat, max_lat = min(rtm.latitude, kota.latitude), max(rtm.latitude, kota.latitude)
        min_lng, max_lng = min(rtm.longitude, kota.longitude), max(rtm.longitude, kota.longitude)

        assert min_lat <= interp["latitude"] <= max_lat
        assert min_lng <= interp["longitude"] <= max_lng
    finally:
        db.close()


def test_09_manual_telemetry_updates_prediction_and_websocket(client):
    """
    Requirement 12: Manual telemetry updates prediction, persists in DB, and broadcasts over WebSocket.
    """
    headers = _get_auth_headers(client)

    res_low = client.post(
        "/api/telemetry/update",
        headers=headers,
        json={
            "train_number": "12951",
            "speed": 128.0,
            "delay": 5.0,
            "weather": "Clear",
            "congestion": "Low",
        },
    )
    assert res_low.status_code == 200
    low_data = res_low.json()
    assert low_data["data_source"] == "MANUAL TELEMETRY"
    assert low_data["data_mode"] == "MANUAL_CONTROL"
    kota_low = next(
        p for p in low_data["telemetry_frame"]["eta_snapshot"]["predictions"]
        if p["station"]["code"] == "KOTA"
    )

    res_high = client.post(
        "/api/telemetry/update",
        headers=headers,
        json={
            "train_number": "12951",
            "speed": 72.0,
            "delay": 52.0,
            "weather": "Heavy Rain",
            "congestion": "High",
        },
    )
    assert res_high.status_code == 200
    high_data = res_high.json()
    kota_high = next(
        p for p in high_data["telemetry_frame"]["eta_snapshot"]["predictions"]
        if p["station"]["code"] == "KOTA"
    )

    assert kota_high["predicted_delay"] > kota_low["predicted_delay"]
    assert kota_high["predicted_eta"] != kota_low["predicted_eta"]

    # Verify persistence across fresh GET /api/trains/12951/eta
    res_eta = client.get("/api/trains/12951/eta")
    assert res_eta.status_code == 200
    persisted = res_eta.json()
    assert persisted["current_delay"] == 52.0
    assert persisted["current_speed"] == 72.0
    assert persisted["data_source"] == "MANUAL TELEMETRY"

    # Verify WebSocket connection reflects manual telemetry
    with client.websocket_connect("/ws/trains/12951") as ws:
        ws_msg = ws.receive_json()
        assert ws_msg["type"] == "TELEMETRY_UPDATE"
        assert ws_msg["train_number"] == "12951"
        assert ws_msg["current_delay_mins"] == 52
        assert ws_msg["data_source"] == "MANUAL TELEMETRY"


def test_10_telemetry_playback_works(client):
    """
    Requirement 13: Telemetry playback works using uploaded telemetry.csv records.
    """
    headers = _get_auth_headers(client)

    res_step = client.post(
        "/api/telemetry/playback",
        headers=headers,
        json={
            "action": "step",
            "train_number": "12951",
            "speed_multiplier": 2,
        },
    )
    assert res_step.status_code == 200
    pb_data = res_step.json()
    assert pb_data["status"] == "ok"
    assert pb_data["data_mode"] == "UPLOADED_TELEMETRY"
    assert pb_data["speed_multiplier"] == 2
    assert pb_data["telemetry_frame"] is not None
    assert pb_data["telemetry_frame"]["train_number"] == "12951"

    # Restore AUTOMATIC_SIMULATION mode
    res_mode = client.post(
        "/api/telemetry/mode",
        headers=headers,
        json={"data_mode": "AUTOMATIC_SIMULATION"},
    )
    assert res_mode.status_code == 200
    assert res_mode.json()["data_mode"] == "AUTOMATIC_SIMULATION"


def test_11_ml_retrain_succeeds_after_historical_data_uploaded(client):
    """
    Requirement 14 (part 2): ML retrain succeeds when sufficient historical data is uploaded.
    """
    headers = _get_auth_headers(client)

    res_retrain = client.post("/api/ml/retrain", headers=headers)
    assert res_retrain.status_code == 200
    body = res_retrain.json()
    assert body["status"] == "retrained"
    assert body["records_used"] >= 10
    assert "metrics" in body

    report = prediction_service.get_evaluation_report()
    assert report["data_source"] == "Uploaded Dataset"
    test_eval = report["test_evaluation"]
    assert "baseline_metrics" in test_eval
    assert "ml_model_metrics" in test_eval


def test_12_custom_uploaded_train_corridor_route_and_map_payload(client):
    """
    Verifies that uploading custom user datasets (e.g. TEST001, TEST002 with stations S1..S5)
    populates Route -> Station relationships and returns full ordered station coordinates
    on GET /api/trains/{train_id}/route and GET /api/trains/{train_id}/status.
    """
    headers = _get_auth_headers(client)

    custom_stations = (
        "station_code,station_name,latitude,longitude\n"
        "S1,Mumbai Central,18.9696,72.8194\n"
        "S2,Borivali,19.2307,72.8567\n"
        "S3,Surat,21.1702,72.8311\n"
        "S4,Vadodara,22.3072,73.1812\n"
        "S5,Ratlam,23.3315,75.0367\n"
    )
    res_st = client.post(
        "/api/datasets/upload",
        headers=headers,
        data={"dataset_type": "stations"},
        files={"file": ("stations.csv", io.BytesIO(custom_stations.encode("utf-8")), "text/csv")},
    )
    assert res_st.status_code == 200

    custom_trains = (
        "train_number,train_name,source,destination\n"
        "TEST001,RailETA Test Express,S1,S5\n"
        "TEST002,RailETA Demo Express,S1,S4\n"
    )
    res_tr = client.post(
        "/api/datasets/upload",
        headers=headers,
        data={"dataset_type": "trains"},
        files={"file": ("trains.csv", io.BytesIO(custom_trains.encode("utf-8")), "text/csv")},
    )
    assert res_tr.status_code == 200

    custom_routes = (
        "train_number,sequence,station_code,distance_km,scheduled_arrival,scheduled_departure\n"
        "TEST001,1,S1,0,06:00,06:05\n"
        "TEST001,2,S2,35,06:40,06:45\n"
        "TEST001,3,S3,265,09:30,09:35\n"
        "TEST001,4,S4,400,11:10,11:15\n"
        "TEST001,5,S5,520,13:00,13:05\n"
        "TEST002,1,S1,0,08:00,08:05\n"
        "TEST002,2,S2,35,08:40,08:45\n"
        "TEST002,3,S3,265,11:20,11:25\n"
        "TEST002,4,S4,400,13:00,13:05\n"
    )
    res_rt = client.post(
        "/api/datasets/upload",
        headers=headers,
        data={"dataset_type": "routes"},
        files={"file": ("routes.csv", io.BytesIO(custom_routes.encode("utf-8")), "text/csv")},
    )
    assert res_rt.status_code == 200

    # Verify GET /api/trains/TEST001/route returns 5 ordered stops with exact Station coordinates
    res_route_1 = client.get("/api/trains/TEST001/route")
    assert res_route_1.status_code == 200
    r1_data = res_route_1.json()
    assert r1_data["train_number"] == "TEST001"
    assert len(r1_data["route"]) == 5
    assert [s["station_code"] for s in r1_data["route"]] == ["S1", "S2", "S3", "S4", "S5"]
    for stop in r1_data["route"]:
        assert stop["latitude"] == stop["lat"]
        assert stop["longitude"] == stop["lng"]
        assert stop["distance_from_origin"] == stop["distance_km"]
        assert 18.0 <= stop["latitude"] <= 24.0
        assert 72.0 <= stop["longitude"] <= 76.0

    # Verify GET /api/trains/TEST002/route returns 4 ordered stops
    res_route_2 = client.get("/api/trains/TEST002/route")
    assert res_route_2.status_code == 200
    r2_data = res_route_2.json()
    assert r2_data["train_number"] == "TEST002"
    assert len(r2_data["route"]) == 4
    assert [s["station_code"] for s in r2_data["route"]] == ["S1", "S2", "S3", "S4"]


def test_13_postgresql_driver_normalization_and_no_sqlite_fallback():
    """
    Verifies:
    1. SQLite fallback occurs ONLY when DATABASE_URL is unset/empty.
    2. Render postgres:// and postgresql:// URLs normalize to postgresql+psycopg:// (or installed driver).
    3. Configured PostgreSQL connection failure raises a clear RuntimeError and NEVER falls back to SQLite.
    4. Production model artifact (raileta_hgb_model.joblib) loads cleanly with no version mismatch.
    """
    import joblib
    import pytest
    import sklearn
    from app.database import DEFAULT_SQLITE_URL, _build_engine, normalize_database_url
    from app.ml.train_model import DEFAULT_MODEL_PATH

    assert normalize_database_url(None) == DEFAULT_SQLITE_URL
    assert normalize_database_url("") == DEFAULT_SQLITE_URL
    assert normalize_database_url("   ") == DEFAULT_SQLITE_URL

    norm_pg1 = normalize_database_url("postgres://user:pass@dpg-example.render.com:5432/raileta_db")
    norm_pg2 = normalize_database_url("postgresql://user:pass@dpg-example.render.com:5432/raileta_db")
    assert norm_pg1 in (
        "postgresql+psycopg://user:pass@dpg-example.render.com:5432/raileta_db",
        "postgresql+psycopg2://user:pass@dpg-example.render.com:5432/raileta_db",
    )
    assert norm_pg1 == norm_pg2

    with pytest.raises(RuntimeError) as exc_info:
        _build_engine(
            normalize_database_url("postgresql://raileta_user:secret@127.0.0.1:54329/unreachable_production_db")
        )
    assert "Refusing to fall back to SQLite" in str(exc_info.value)

    assert DEFAULT_MODEL_PATH.exists()
    prod_bundle = joblib.load(DEFAULT_MODEL_PATH)
    assert prod_bundle.get("sklearn_version") == sklearn.__version__


