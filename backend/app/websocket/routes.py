"""
WebSocket Route Handler (`WS /ws/trains/{train_id}`).
Streams live locomotive GPS coordinates, speed, delay, data source badge,
and updated ML ETA predictions to connected clients without requiring page refreshes.
"""

import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.services.eta_service import build_ws_telemetry_frame, resolve_train
from app.services.simulator_service import simulator_service
from app.services.telemetry_providers import get_or_create_system_state
from app.websocket.manager import ws_manager

router = APIRouter()


@router.websocket("/ws/trains/{train_id}")
async def train_live_websocket(websocket: WebSocket, train_id: str):
    db = SessionLocal()
    try:
        train = resolve_train(db, train_id)
        if not train:
            await websocket.accept()
            await websocket.send_json(
                {
                    "type": "ERROR",
                    "detail": f"Train '{train_id}' not found",
                }
            )
            await websocket.close(code=1008)
            return

        key = train.train_number
        await ws_manager.connect(key, websocket)

        # Immediately send the current persisted telemetry + ML ETA snapshot upon connection
        initial_frame = build_ws_telemetry_frame(db, train)
        await websocket.send_json(initial_frame)

        # Keep connection alive and push periodic updates according to active data_mode
        while True:
            db.expire_all()
            sys_state = get_or_create_system_state(db)
            sleep_secs = 3.5
            if (
                sys_state.data_mode == "UPLOADED_TELEMETRY"
                and sys_state.playback_status == "PLAYING"
            ):
                mult = max(1.0, float(sys_state.playback_speed or 1.0))
                sleep_secs = max(0.35, 3.0 / mult)

            await asyncio.sleep(sleep_secs)
            db.expire_all()
            refreshed_train = resolve_train(db, key)
            if not refreshed_train:
                break

            sys_state = get_or_create_system_state(db)
            if sys_state.data_mode == "AUTOMATIC_SIMULATION":
                frame = simulator_service.step_single_train(
                    db, refreshed_train, respect_mode=True
                )
                await websocket.send_json(frame)
            elif (
                sys_state.data_mode == "UPLOADED_TELEMETRY"
                and sys_state.playback_status == "PLAYING"
            ):
                pb_frame = simulator_service.step_playback_record(db)
                if pb_frame:
                    await websocket.send_json(pb_frame)
            else:
                # In MANUAL_CONTROL, preserve the manual telemetry state in PostgreSQL
                frame = build_ws_telemetry_frame(db, refreshed_train)
                await websocket.send_json(frame)
    except WebSocketDisconnect:
        ws_manager.disconnect(train_id, websocket)
    finally:
        ws_manager.disconnect(train_id, websocket)
        db.close()
