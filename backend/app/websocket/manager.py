"""
WebSocket Connection Manager for RailETA Live Telemetry.
"""

from collections import defaultdict
from typing import Any, Dict, List
from fastapi import WebSocket


class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = defaultdict(list)

    async def connect(self, train_key: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections[train_key].append(websocket)

    def disconnect(self, train_key: str, websocket: WebSocket) -> None:
        if websocket in self.active_connections.get(train_key, []):
            self.active_connections[train_key].remove(websocket)

    async def broadcast_to_train(self, train_key: str, payload: Dict[str, Any]) -> None:
        conns = list(self.active_connections.get(train_key, []))
        for ws in conns:
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(train_key, ws)


ws_manager = WebSocketManager()
