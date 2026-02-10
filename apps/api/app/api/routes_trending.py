from __future__ import annotations

"""Trending endpoints."""

from fastapi import APIRouter, Query

from app.domain.models import TrendingItem, TrendingResponse
from app.optimizer import pricing
from app.services.state_store import get_store

router = APIRouter()


@router.get("/trending", response_model=TrendingResponse)
def trending(limit: int = Query(10, ge=1, le=50)) -> TrendingResponse:
    store = get_store()
    opps = list(store.opps.values())
    if not opps:
        return TrendingResponse(items=[])

    capacities = {opp.id: opp.capacity for opp in opps}
    pricing.compute_pulses(store, capacities, record_history=True)

    items: list[TrendingItem] = []
    for opp in opps:
        history = store.pulse_history.get(opp.id, [])
        if len(history) >= 2:
            pulse_delta = history[-1][1] - history[-2][1]
            pulse = history[-1][1]
        elif len(history) == 1:
            pulse = history[-1][1]
            pulse_delta = 0.0
        else:
            pulse = store.prices.get(opp.id, 50.0)
            pulse_delta = 0.0

        items.append(
            TrendingItem(
                event_id=opp.id,
                title=opp.title,
                pulse=pulse,
                pulse_delta=pulse_delta,
            )
        )

    items.sort(key=lambda item: item.pulse_delta, reverse=True)
    return TrendingResponse(items=items[:limit])
