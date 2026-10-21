import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

app = FastAPI(title="AgriPredict API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001",
    ).split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_PATH = Path(
    os.getenv("DATABASE_PATH", str(Path(__file__).resolve().parents[1] / "data" / "agripredict.db"))
)
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-development-secret")
JWT_TTL_SECONDS = 60 * 60 * 24
bearer_scheme = HTTPBearer()


class CropInputs(BaseModel):
    N: float = Field(..., ge=0, le=140, description="Nitrogen content")
    P: float = Field(..., ge=5, le=145, description="Phosphorus content")
    K: float = Field(..., ge=5, le=205, description="Potassium content")
    temperature: float = Field(..., ge=8.8, le=43.7)
    humidity: float = Field(..., ge=14.3, le=100)
    ph: float = Field(..., ge=3.5, le=9.9)
    rainfall: float = Field(..., ge=20.2, le=298.6)


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_.-]+$")
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str
    password: str


def _connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _init_database() -> None:
    with _connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS prediction_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                inputs_json TEXT NOT NULL,
                crop TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )


@app.on_event("startup")
def startup() -> None:
    _init_database()


def _password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(digest).decode()}"


def _password_matches(password: str, stored: str) -> bool:
    try:
        algorithm, encoded_salt, encoded_digest = stored.split("$")
        if algorithm != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(encoded_salt.encode())
        expected = base64.urlsafe_b64decode(encoded_digest.encode())
        actual = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
        return hmac.compare_digest(actual, expected)
    except (ValueError, base64.binascii.Error):
        return False


def _encode_token(user_id: int) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"sub": str(user_id), "exp": int(time.time()) + JWT_TTL_SECONDS}

    def encode(value: dict[str, object]) -> str:
        return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=").decode()

    message = f"{encode(header)}.{encode(payload)}"
    signature = hmac.new(JWT_SECRET.encode(), message.encode(), hashlib.sha256).digest()
    return f"{message}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"


def _decode_token(token: str) -> int:
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
        message = f"{encoded_header}.{encoded_payload}"
        expected = hmac.new(JWT_SECRET.encode(), message.encode(), hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode(encoded_signature + "===")
        if not hmac.compare_digest(expected, supplied):
            raise ValueError
        payload = json.loads(base64.urlsafe_b64decode(encoded_payload + "==="))
        if payload["exp"] < time.time():
            raise ValueError
        return int(payload["sub"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError, base64.binascii.Error):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> sqlite3.Row:
    user_id = _decode_token(credentials.credentials)
    with _connection() as connection:
        user = connection.execute(
            "SELECT id, username, email, created_at FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    return user


def _user_response(user: sqlite3.Row, token: str) -> dict[str, object]:
    return {
        "token": token,
        "user": {"id": user["id"], "username": user["username"], "email": user["email"]},
    }


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/model")
def model_info() -> dict[str, object]:
    from app.predictor import get_predictor

    return get_predictor().info()


@app.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest) -> dict[str, object]:
    email = request.email.strip().lower()
    with _connection() as connection:
        try:
            connection.execute(
                "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
                (request.username.strip(), email, _password_hash(request.password)),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already exists")
        user = connection.execute(
            "SELECT id, username, email, created_at FROM users WHERE email = ?", (email,)
        ).fetchone()
    return _user_response(user, _encode_token(user["id"]))


@app.post("/auth/login")
def login(request: LoginRequest) -> dict[str, object]:
    with _connection() as connection:
        user = connection.execute("SELECT * FROM users WHERE email = ?", (request.email.strip().lower(),)).fetchone()
    if user is None or not _password_matches(request.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return _user_response(user, _encode_token(user["id"]))


@app.get("/auth/me")
def me(user: sqlite3.Row = Depends(current_user)) -> dict[str, object]:
    return {"id": user["id"], "username": user["username"], "email": user["email"]}


@app.delete("/auth/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(user: sqlite3.Row = Depends(current_user)) -> None:
    with _connection() as connection:
        connection.execute("DELETE FROM users WHERE id = ?", (user["id"],))


@app.get("/history")
def history(user: sqlite3.Row = Depends(current_user)) -> list[dict[str, object]]:
    with _connection() as connection:
        rows = connection.execute(
            "SELECT id, inputs_json, crop, created_at FROM prediction_history "
            "WHERE user_id = ? ORDER BY id DESC LIMIT 50",
            (user["id"],),
        ).fetchall()
    return [
        {"id": row["id"], "inputs": json.loads(row["inputs_json"]), "crop": row["crop"], "created_at": row["created_at"]}
        for row in rows
    ]


@app.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
def clear_history(user: sqlite3.Row = Depends(current_user)) -> None:
    with _connection() as connection:
        connection.execute("DELETE FROM prediction_history WHERE user_id = ?", (user["id"],))


@app.delete("/history/{history_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_history_item(history_id: int, user: sqlite3.Row = Depends(current_user)) -> None:
    with _connection() as connection:
        deleted = connection.execute(
            "DELETE FROM prediction_history WHERE id = ? AND user_id = ?",
            (history_id, user["id"]),
        ).rowcount
    if deleted == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="History item not found")


@app.post("/predict")
def predict_crop(inputs: CropInputs, user: sqlite3.Row = Depends(current_user)) -> dict[str, str]:
    from app.predictor import get_predictor

    values = inputs.model_dump()
    crop = get_predictor().predict(values)
    with _connection() as connection:
        connection.execute(
            "INSERT INTO prediction_history (user_id, inputs_json, crop) VALUES (?, ?, ?)",
            (user["id"], json.dumps(values), crop),
        )
    return {"crop": crop}
