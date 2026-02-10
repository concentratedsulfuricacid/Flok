from __future__ import annotations

"""Event/opportunity endpoints."""

from fastapi import APIRouter, HTTPException, Query

from app.domain.models import (
    EventCreateRequest,
    EventCreateResponse,
    EventDetailResponse,
    EventUpdateRequest,
    EventUpdateResponse,
    ExplanationResponse,
    RSVPRequest,
    RSVPResponse,
)
from app.optimizer import pricing, solver
from app.services.state_store import get_store

router = APIRouter()


@router.post("/events", response_model=EventCreateResponse)
def create_event(request: EventCreateRequest) -> EventCreateResponse:
    store = get_store()
    with store.lock:
        idx = len(store.opps)
        event_id = f"o{idx}"
        while event_id in store.opps:
            idx += 1
            event_id = f"o{idx}"

        opp = request.model_dump()
        opp["id"] = event_id
        opportunity = store.opps.get(event_id)
        if opportunity:
            raise HTTPException(status_code=400, detail="Event id already exists")

        from app.domain.models import Opportunity

        store.opps[event_id] = Opportunity.model_validate(opp)
        store._ensure_opp_state(event_id)

    return EventCreateResponse(event_id=event_id)


@router.patch("/events/{event_id}", response_model=EventUpdateResponse)
def update_event(event_id: str, request: EventUpdateRequest) -> EventUpdateResponse:
    store = get_store()
    with store.lock:
        opp = store.opps.get(event_id)
        if not opp:
            raise HTTPException(status_code=404, detail="Event not found")
        updates = {k: v for k, v in request.model_dump().items() if v is not None}
        store.opps[event_id] = opp.model_copy(update=updates)
    return EventUpdateResponse(event_id=event_id)


@router.get("/events/{event_id}", response_model=EventDetailResponse)
def get_event(event_id: str, include_history: bool = Query(False)) -> EventDetailResponse:
    store = get_store()
    opp = store.opps.get(event_id)
    if not opp:
        raise HTTPException(status_code=404, detail="Event not found")

    capacities = {opp.id: opp.capacity}
    pricing.compute_pulses(store, capacities)
    pulse = store.prices.get(opp.id, 50.0)
    spots_left = opp.capacity - len(store.rsvps.get(opp.id, set()))
    history = store.pulse_history.get(opp.id) if include_history else None

    return EventDetailResponse(
        event=opp,
        pulse=pulse,
        spots_left=max(0, spots_left),
        pulse_history=history,
    )


@router.post("/events/{event_id}/rsvp", response_model=RSVPResponse)
def rsvp(event_id: str, request: RSVPRequest) -> RSVPResponse:
    store = get_store()
    with store.lock:
        opp = store.opps.get(event_id)
        if not opp:
            raise HTTPException(status_code=404, detail="Event not found")
        if request.user_id not in store.users:
            raise HTTPException(status_code=404, detail="User not found")

        rsvp_set = store.rsvps.setdefault(event_id, set())
        if request.user_id in rsvp_set:
            spots_left = opp.capacity - len(rsvp_set)
            return RSVPResponse(event_id=event_id, status="ACCEPTED", spots_left=max(0, spots_left))

        spots_left = opp.capacity - len(rsvp_set)
        if spots_left <= 0:
            return RSVPResponse(event_id=event_id, status="FULL", spots_left=0)

        rsvp_set.add(request.user_id)
        spots_left = opp.capacity - len(rsvp_set)

    # record feedback outside the lock to avoid deadlocks
    store.record_feedback({"user_id": request.user_id, "opp_id": event_id, "event": "accepted"})

    return RSVPResponse(event_id=event_id, status="ACCEPTED", spots_left=max(0, spots_left))


@router.get("/events/{event_id}/explain", response_model=ExplanationResponse)
def explain_event(event_id: str, user_id: str = Query(...)) -> ExplanationResponse:
    store = get_store()
    user = store.users.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    opp = store.opps.get(event_id)
    if not opp:
        raise HTTPException(status_code=404, detail="Event not found")

    score_matrix, explanations = solver.build_score_matrix([user], [opp], store)
    key = f"{user.id}|{opp.id}"
    expl = explanations.get(key)
    if not expl:
        raise HTTPException(status_code=400, detail="No feasible match (availability mismatch)")

    return ExplanationResponse(
        event_id=event_id,
        user_id=user_id,
        score=expl.score,
        breakdown=expl.breakdown,
        reasons=expl.reason_chips,
    )
