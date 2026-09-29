"""
Authentication Routes (`POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.railway import User
from app.schemas.railway import (
    LoginRequestSchema,
    TokenResponseSchema,
    UserResponseSchema,
)
from app.services.auth_service import (
    JWT_EXPIRE_SECONDS,
    authenticate_user,
    create_access_token,
    get_current_user,
    get_demo_credentials,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def _to_user_response(user: User) -> UserResponseSchema:
    demo_username, _ = get_demo_credentials()
    is_demo = user.username == demo_username
    return UserResponseSchema(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        is_demo=is_demo,
        account_label="Demo Account" if is_demo else "Authenticated User",
        created_at=user.created_at,
    )


@router.post("/login", response_model=TokenResponseSchema)
def login(payload: LoginRequestSchema, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.username, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password. For evaluation, use Demo Account credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(user, expires_seconds=JWT_EXPIRE_SECONDS)
    return TokenResponseSchema(
        access_token=token,
        token_type="bearer",
        expires_in=JWT_EXPIRE_SECONDS,
        user=_to_user_response(user),
    )


@router.get("/me", response_model=UserResponseSchema)
def get_me(current_user: User = Depends(get_current_user)):
    return _to_user_response(current_user)


@router.post("/logout")
def logout():
    return {
        "status": "logged_out",
        "detail": "Session terminated successfully.",
    }
