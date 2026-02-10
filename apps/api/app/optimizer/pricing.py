from __future__ import annotations

"""Market-maker pulse computation based on net demand signals."""

from dataclasses import dataclass
from math import exp
from typing import Dict

from app.core.config import get_settings
from app.services.state_store import StateStore


@dataclass
class PricingConfig:
    """Pricing configuration parameters."""

    lambda_price: float
    liquidity_k: float


def get_pricing_config(overrides: dict | None = None) -> PricingConfig:
    """Resolve pricing config using defaults and optional overrides."""
    settings = get_settings()
    cfg = PricingConfig(
        lambda_price=settings.pricing_lambda,
        liquidity_k=settings.pricing_liquidity_k,
    )
    if overrides:
        for key in ["lambda_price", "liquidity_k"]:
            if key in overrides and overrides[key] is not None:
                setattr(cfg, key, float(overrides[key]))
    return cfg


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + exp(-x))


def pulse_from_demand(net_demand: float, liquidity: float) -> float:
    """Compute bounded pulse (0..100) from net demand and liquidity."""
    if liquidity <= 0:
        return 50.0
    return 100.0 * _sigmoid(net_demand / liquidity)


def compute_pulses(
    store: StateStore,
    capacities: Dict[str, int],
    overrides: dict | None = None,
    record_history: bool = False,
) -> Dict[str, float]:
    """Compute per-opportunity pulses and store them in prices."""
    cfg = get_pricing_config(overrides)
    pulses: Dict[str, float] = {}
    now = None
    for opp_id, cap in capacities.items():
        liquidity = cfg.liquidity_k * max(1, cap)
        net = store.net_demand.get(opp_id, 0.0)
        pulse = pulse_from_demand(net, liquidity)
        store.prices[opp_id] = pulse
        pulses[opp_id] = pulse
        if record_history:
            if now is None:
                from datetime import datetime, timezone

                now = datetime.now(timezone.utc).isoformat()
            history = store.pulse_history.get(opp_id, [])
            history.append((now, pulse))
            if len(history) > 50:
                history = history[-50:]
            store.pulse_history[opp_id] = history
    return pulses
