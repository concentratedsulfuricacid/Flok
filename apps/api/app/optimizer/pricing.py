from __future__ import annotations

"""Market-maker pricing updates based on recent demand signals."""

from dataclasses import dataclass
from typing import Dict

from app.core.config import get_settings
from app.services.state_store import StateStore


@dataclass
class PricingConfig:
    """Pricing configuration parameters."""

    eta: float
    rho: float
    p_min: float
    p_max: float
    lambda_price: float


def get_pricing_config(overrides: dict | None = None) -> PricingConfig:
    """Resolve pricing config using defaults and optional overrides."""
    settings = get_settings()
    cfg = PricingConfig(
        eta=settings.pricing_eta,
        rho=settings.pricing_rho,
        p_min=settings.pricing_p_min,
        p_max=settings.pricing_p_max,
        lambda_price=settings.pricing_lambda,
    )
    if overrides:
        for key in ["eta", "rho", "p_min", "p_max", "lambda_price"]:
            if key in overrides and overrides[key] is not None:
                setattr(cfg, key, float(overrides[key]))
    return cfg


def update_prices(store: StateStore, capacities: Dict[str, int], overrides: dict | None = None) -> Dict[str, float]:
    """Update prices in the store based on demand and capacity."""
    cfg = get_pricing_config(overrides)
    deltas: Dict[str, float] = {}
    for opp_id, cap in capacities.items():
        if cap <= 0:
            continue
        demand = store.demand_window.get(opp_id, 0)
        fill = demand / float(cap)
        avg_fill = store.avg_fill.get(opp_id, 1.0)
        avg_fill = (1.0 - cfg.rho) * avg_fill + cfg.rho * fill
        price = store.prices.get(opp_id, 0.0)
        price_next = price + cfg.eta * (avg_fill - 1.0)
        price_next = max(cfg.p_min, min(cfg.p_max, price_next))

        store.avg_fill[opp_id] = avg_fill
        store.prices[opp_id] = price_next
        deltas[opp_id] = price_next - price
    return deltas
