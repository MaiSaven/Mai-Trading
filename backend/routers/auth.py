import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
import jwt
from sqlalchemy.orm import Session

from config import GOOGLE_CLIENT_ID, JWT_ALGORITHM, JWT_EXPIRATION_HOURS, JWT_SECRET
from database import get_db
from models import User, Account
from schemas import AuthResponse, GoogleLoginRequest, UserResponse

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


def create_access_token(user_id: int, email: str) -> str:
    """Generate a signed JWT access token for application session."""
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": expire,
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """Dependency that decodes the Bearer token and returns the current authenticated User."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload.get("sub"))
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def verify_account_access(db: Session, user: User, account_id: Optional[int] = None) -> list[int]:
    """
    Validates that the user owns the specified account_id (or returns all account IDs owned by the user).
    Raises HTTPException(403) if the user attempts to access an account they do not own (IDOR protection).
    """
    user_account_ids = [
        acc.account_id for acc in db.query(Account.account_id).filter(Account.user_id == user.id).all()
    ]

    if account_id is not None:
        if account_id not in user_account_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: You do not own trading account #{account_id}"
            )
        return [account_id]

    return user_account_ids


@router.get("/config")
def get_auth_config():
    """Returns the public auth configuration for the frontend."""
    return {
        "google_client_id": GOOGLE_CLIENT_ID,
        "is_configured": bool(GOOGLE_CLIENT_ID and not GOOGLE_CLIENT_ID.startswith("your-")),
    }


@router.post("/google", response_model=AuthResponse)
def login_with_google(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    """Verifies a Google OAuth ID token, syncs user into PostgreSQL, and issues an app JWT."""
    if not payload.credential:
        raise HTTPException(status_code=400, detail="Google credential token is required")

    try:
        # Verify the integrity and authenticity of the Google token
        audience = GOOGLE_CLIENT_ID if (GOOGLE_CLIENT_ID and not GOOGLE_CLIENT_ID.startswith("your-")) else None
        id_info = id_token.verify_oauth2_token(
            payload.credential,
            google_requests.Request(),
            audience
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid Google ID token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error validating Google token: {str(e)}")

    google_id = id_info.get("sub")
    email = id_info.get("email")
    name = id_info.get("name") or email.split("@")[0]
    picture = id_info.get("picture")

    if not email:
        raise HTTPException(status_code=400, detail="Google token does not contain an email address")

    # Find or create user
    user = db.query(User).filter((User.google_id == google_id) | (User.email == email)).first()
    if not user:
        user = User(
            google_id=google_id,
            email=email,
            name=name,
            picture=picture,
            last_login=datetime.utcnow()
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Update profile info
        user.google_id = google_id
        user.name = name or user.name
        user.picture = picture or user.picture
        user.last_login = datetime.utcnow()
        db.commit()
        db.refresh(user)

    token = create_access_token(user.id, user.email)
    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.from_orm(user)
    )


@router.post("/demo-login", response_model=AuthResponse)
def login_demo(db: Session = Depends(get_db)):
    """Developer / Demo login to access the dashboard without setting up Google Cloud Console."""
    demo_email = "trader@mai-trading.local"
    user = db.query(User).filter(User.email == demo_email).first()
    if not user:
        user = User(
            google_id="demo-user-12345",
            email=demo_email,
            name="Demo Trader",
            picture="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
            last_login=datetime.utcnow()
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.last_login = datetime.utcnow()
        db.commit()
        db.refresh(user)

    token = create_access_token(user.id, user.email)
    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.from_orm(user)
    )


@router.get("/me", response_model=UserResponse)
def get_current_user_profile(user: User = Depends(get_current_user)):
    """Returns the profile of the currently logged-in user."""
    return user

