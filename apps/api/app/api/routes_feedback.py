from __future__ import annotations

"""Feedback endpoint: record user interactions."""

from fastapi import APIRouter, HTTPException

from app.domain.models import FeedbackRequest, FeedbackResponse
from app.services.state_store import get_store

router = APIRouter()


@router.post("/feedback", response_model=FeedbackResponse)
def feedback(request: FeedbackRequest) -> FeedbackResponse:
    """Record feedback and return demand counters."""
    store = get_store()
    if request.opp_id not in store.opps:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    store.record_feedback(request)

    demand = store.demand_window.get(request.opp_id, 0)
    shown = store.shown_window.get(request.opp_id, 0)
    return FeedbackResponse(
        opp_id=request.opp_id,
        demand=demand,
        shown=shown,
        total_interactions=len(store.interactions),
    )
