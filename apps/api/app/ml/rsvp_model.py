from __future__ import annotations

"""Lightweight logistic regression model for RSVP prediction."""

import json
from dataclasses import dataclass
from math import exp
from pathlib import Path
from typing import Dict, List

from app.core.config import get_settings

FEATURE_ORDER = [
    "interest",
    "goal_match",
    "group_match",
    "travel_penalty",
    "intensity_mismatch",
    "novelty_bonus",
    "pulse_centered",
    "availability_ok",
]


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + exp(-x))


@dataclass
class LogisticModel:
    feature_order: List[str]
    weights: List[float]
    bias: float

    def predict_proba(self, features: Dict[str, float]) -> float:
        z = self.bias
        for idx, name in enumerate(self.feature_order):
            z += self.weights[idx] * float(features.get(name, 0.0))
        return _sigmoid(z)


_model: LogisticModel | None = None


def _default_model() -> LogisticModel:
    return LogisticModel(feature_order=list(FEATURE_ORDER), weights=[0.0] * len(FEATURE_ORDER), bias=0.0)


def _resolve_model_path(path_str: str) -> Path:
    path = Path(path_str)
    if path.is_absolute():
        return path
    api_root = Path(__file__).resolve().parents[2]
    return api_root / path


def load_model(path: str | None = None) -> LogisticModel:
    settings = get_settings()
    model_path = _resolve_model_path(path or settings.rsvp_model_path)
    if not model_path.exists():
        return _default_model()
    payload = json.loads(model_path.read_text())
    feature_order = payload.get("feature_order") or FEATURE_ORDER
    weights = payload.get("weights") or [0.0] * len(feature_order)
    bias = payload.get("bias", 0.0)
    return LogisticModel(feature_order=feature_order, weights=weights, bias=bias)


def get_model() -> LogisticModel:
    global _model
    if _model is None:
        _model = load_model()
    return _model


def build_ml_feature_dict(
    *,
    interest: float,
    goal_match: float,
    group_match: float,
    travel_penalty: float,
    intensity_mismatch: float,
    novelty_bonus: float,
    pulse_centered: float,
    availability_ok: float,
) -> Dict[str, float]:
    return {
        "interest": interest,
        "goal_match": goal_match,
        "group_match": group_match,
        "travel_penalty": travel_penalty,
        "intensity_mismatch": intensity_mismatch,
        "novelty_bonus": novelty_bonus,
        "pulse_centered": pulse_centered,
        "availability_ok": availability_ok,
    }
