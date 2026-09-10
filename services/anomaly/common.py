import os
import re
from pathlib import Path

import psycopg
import requests
from dotenv import load_dotenv
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "")
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
ARTIFACTS = ROOT / "artifacts"
PAYMENT_ENDPOINT = "/api/transactions/:id/pay"


def validate_id(value):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value):
        raise ValueError(
            "ID harus 1–64 karakter: huruf, angka, underscore, atau tanda minus."
        )
    return value


def connect():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL belum diatur.")
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def new_session():
    session = requests.Session()
    # Endpoint demo lokal tidak memerlukan proxy dari environment host.
    session.trust_env = False
    return session


def api_request(session, method, path, **kwargs):
    response = session.request(
        method,
        API_BASE_URL + path,
        timeout=(3, 10),
        **kwargs,
    )

    if not response.ok:
        raise RuntimeError(
            f"{method} {path}: HTTP {response.status_code}: {response.text[:200]}"
        )

    return response.json()