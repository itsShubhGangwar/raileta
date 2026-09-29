"""
Entry point shim allowing `uvicorn main:app` or `uvicorn app.main:app`
from the `backend/` directory.
"""

from app.main import app, initialize_system

__all__ = ["app", "initialize_system"]
