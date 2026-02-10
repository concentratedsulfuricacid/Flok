from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _get_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


def _get_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def _get_str(name: str, default: str) -> str:
    return os.getenv(name, default)


@dataclass(frozen=True)
class Settings:
    distance_scale_mins: float
    pricing_eta: float
    pricing_rho: float
    pricing_p_min: float
    pricing_p_max: float
    pricing_lambda: float
    fairness_lambda: float
    cors_origins: list[str]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    cors_raw = _get_str("CORS_ORIGINS", "*")
    cors_origins = [o.strip() for o in cors_raw.split(",") if o.strip()]
    if not cors_origins:
        cors_origins = ["*"]
    return Settings(
        distance_scale_mins=_get_float("DISTANCE_SCALE_MINS", 10.0),
        pricing_eta=_get_float("PRICING_ETA", 0.3),
        pricing_rho=_get_float("PRICING_RHO", 0.2),
        pricing_p_min=_get_float("PRICING_P_MIN", -3.0),
        pricing_p_max=_get_float("PRICING_P_MAX", 3.0),
        pricing_lambda=_get_float("PRICING_LAMBDA", 1.0),
        fairness_lambda=_get_float("FAIRNESS_LAMBDA", 0.5),
        cors_origins=cors_origins,
    )
