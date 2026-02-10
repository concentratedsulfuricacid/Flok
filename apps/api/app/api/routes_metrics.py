from __future__ import annotations

"""Metrics endpoint: serve dashboard metrics and demand state."""

from fastapi import APIRouter

from app.domain.models import MetricsResponse
from app.metrics.compute import compute_metrics
from app.services.state_store import get_store

router = APIRouter()


@router.get("/metrics", response_model=MetricsResponse)
def metrics() -> MetricsResponse:
    """Return latest metrics and pricing state."""
    store = get_store()
    users = list(store.users.values())
    opps = list(store.opps.values())
    assignments = store.last_assignment

    metrics_result = compute_metrics(users, opps, assignments, store)

    return MetricsResponse(
        metrics=metrics_result,
        prices=dict(store.prices),
        demand_by_opp=dict(store.net_demand),
        shown_by_opp=dict(store.shown_window),
    )
