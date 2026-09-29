"""
Authentication & Security Service for RailETA.
- Hashes passwords securely with bcrypt (with PBKDF2-SHA256 fallback).
- Never stores or logs plaintext passwords.
- Issues and verifies signed HS256 JWT access tokens.
- Seeds the default Demo Account idempotently using DEMO_USERNAME and DEMO_PASSWORD.
"""

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import os
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.railway import User

try:
    import bcrypt as _bcrypt
except ImportError:
    _bcrypt = None

try:
    import jwt as _pyjwt
except ImportError:
    _pyjwt = None

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_SECONDS = 86400  # 24 hours

security_scheme = HTTPBearer(auto_error=False)


def get_jwt_secret() -> str:
    return os.getenv(
        "JWT_SECRET_KEY",
        "raileta-jwt-signing-key-2026-production-override-via-env",
    )


def get_demo_credentials() -> tuple[str, str]:
    username = os.getenv("DEMO_USERNAME", "demo").strip() or "demo"
    password = os.getenv("DEMO_PASSWORD", "RailETA-Demo-2026").strip() or "RailETA-Demo-2026"
    return username, password


def hash_password(plain_password: str) -> str:
    """Hashes a plaintext password using bcrypt (never stores plaintext)."""
    pw_bytes = plain_password.encode("utf-8")
    if _bcrypt is not None:
        salt = _bcrypt.gensalt(rounds=12)
        return _bcrypt.hashpw(pw_bytes, salt).decode("utf-8")
    salt_hex = os.urandom(16).hex()
    dk = hashlib.pbkdf2_hmac("sha256", pw_bytes, bytes.fromhex(salt_hex), 310000)
    return f"$pbkdf2-sha256$310000${salt_hex}${dk.hex()}"


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verifies a plaintext password against a stored bcrypt or PBKDF2 hash."""
    if not plain_password or not password_hash:
        return False
    pw_bytes = plain_password.encode("utf-8")
    try:
        if password_hash.startswith("$2"):
            if _bcrypt is not None:
                return bool(_bcrypt.checkpw(pw_bytes, password_hash.encode("utf-8")))
            return False
        if password_hash.startswith("$pbkdf2-sha256$"):
            parts = password_hash.split("$")
            iterations = int(parts[2])
            salt_hex = parts[3]
            expected_hex = parts[4]
            dk = hashlib.pbkdf2_hmac(
                "sha256", pw_bytes, bytes.fromhex(salt_hex), iterations
            )
            return hmac.compare_digest(dk.hex(), expected_hex)
    except Exception:
        return False
    return False


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def create_access_token(user: User, expires_seconds: int = JWT_EXPIRE_SECONDS) -> str:
    now_ts = int(datetime.now(timezone.utc).timestamp())
    payload = {
        "sub": user.username,
        "uid": user.id,
        "iat": now_ts,
        "exp": now_ts + expires_seconds,
    }
    secret = get_jwt_secret()
    if _pyjwt is not None:
        return str(_pyjwt.encode(payload, secret, algorithm=JWT_ALGORITHM))
    header_b64 = _b64url_encode(
        json.dumps({"alg": JWT_ALGORITHM, "typ": "JWT"}, separators=(",", ":")).encode("utf-8")
    )
    payload_b64 = _b64url_encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(sig)}"


def decode_access_token(token: str) -> Optional[dict]:
    secret = get_jwt_secret()
    try:
        if _pyjwt is not None:
            return dict(_pyjwt.decode(token, secret, algorithms=[JWT_ALGORITHM]))
        parts = token.split(".")
        if len(parts) != 3:
            return None
        signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
        expected_sig = hmac.new(
            secret.encode("utf-8"), signing_input, hashlib.sha256
        ).digest()
        actual_sig = _b64url_decode(parts[2])
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        payload = json.loads(_b64url_decode(parts[1]).decode("utf-8"))
        now_ts = int(datetime.now(timezone.utc).timestamp())
        if int(payload.get("exp", 0)) < now_ts:
            return None
        return payload
    except Exception:
        return None


def seed_demo_user_if_needed(db: Session) -> User:
    """
    Idempotently creates or updates the default Demo Account in the database.
    Never logs plaintext passwords.
    """
    demo_username, demo_password = get_demo_credentials()
    existing = db.query(User).filter(User.username == demo_username).first()
    if existing:
        if not verify_password(demo_password, existing.password_hash):
            existing.password_hash = hash_password(demo_password)
            db.commit()
            db.refresh(existing)
        return existing

    demo_user = User(
        username=demo_username,
        email=f"{demo_username}@raileta.demo",
        password_hash=hash_password(demo_password),
        is_active=True,
        created_at=datetime.utcnow(),
    )
    db.add(demo_user)
    db.commit()
    db.refresh(demo_user)
    print(f"[RailETA Auth] Seeded default Demo Account (username='{demo_username}').")
    return demo_user


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    cleaned = username.strip()
    user = db.query(User).filter(User.username == cleaned).first()
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in to access this resource.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(credentials.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    username = str(payload["sub"])
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user account not found or inactive.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
