from __future__ import annotations

"""Configuration helpers and environment-driven settings."""

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
    """Typed configuration values used across the backend."""

    distance_scale_mins: float
    pricing_lambda: float
    pricing_liquidity_k: float
    demand_decay_tau_hours: float
    fairness_lambda: float
    cors_origins: list[str]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load settings from environment with defaults."""
    cors_raw = _get_str("CORS_ORIGINS", "*")
    cors_origins = [o.strip() for o in cors_raw.split(",") if o.strip()]
    if not cors_origins:
        cors_origins = ["*"]
    return Settings(
        distance_scale_mins=_get_float("DISTANCE_SCALE_MINS", 10.0),
        pricing_lambda=_get_float("PRICING_LAMBDA", 1.0),
        pricing_liquidity_k=_get_float("PRICING_LIQUIDITY_K", 5.0),
        demand_decay_tau_hours=_get_float("DEMAND_DECAY_TAU_HOURS", 12.0),
        fairness_lambda=_get_float("FAIRNESS_LAMBDA", 0.5),
        cors_origins=cors_origins,
    )
