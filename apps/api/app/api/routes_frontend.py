from __future__ import annotations

"""Legacy/Frontend-compatible API endpoints under /api."""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.domain.models import Opportunity
from app.optimizer import solver
from app.services.state_store import get_store

router = APIRouter(prefix="/api")


class FrontendEvent(BaseModel):
    description: str
    creator: str
    dateTime: str
    participants: List[str] = Field(default_factory=list)
    capacity: int
    isFull: bool
    location: str
    tags: List[str] = Field(default_factory=list)


class FrontendEventCreate(BaseModel):
    description: str
    creator: str
    dateTime: str
    participants: List[str] = Field(default_factory=list)
    capacity: int
    isFull: bool
    location: str
    tags: List[str] = Field(default_factory=list)


class FrontendFriend(BaseModel):
    id: Optional[str] = None
    name: str


@router.get("/friends", response_model=List[FrontendFriend])
def friends() -> List[FrontendFriend]:
    store = get_store()
    users = list(store.users.values())
    if not users:
        return []
    return [FrontendFriend(id=u.id, name=f"Friend {u.id}") for u in users]


@router.post("/events", response_model=dict)
def create_event(event: FrontendEventCreate) -> dict:
    store = get_store()
    with store.lock:
        idx = len(store.opps)
        event_id = f"o{idx}"
        while event_id in store.opps:
            idx += 1
            event_id = f"o{idx}"

        lat, lng = 0.0, 0.0
        if "," in event.location:
            try:
                lat_str, lng_str = event.location.split(",", 1)
                lat = float(lat_str.strip())
                lng = float(lng_str.strip())
            except ValueError:
                pass

        opp = Opportunity(
            id=event_id,
            title=event.description[:64],
            description=event.description,
            tags=event.tags,
            category="community",
            time_bucket="weeknights",
            time=event.dateTime,
            lat=lat,
            lng=lng,
            capacity=max(1, event.capacity),
            group_size="medium",
            intensity="med",
            beginner_friendly=True,
        )
        store.opps[event_id] = opp
        store._ensure_opp_state(event_id)

    return {"id": event_id}


@router.get("/events/recommended", response_model=List[FrontendEvent])
def recommended_events(user_id: Optional[str] = Query(None)) -> List[FrontendEvent]:
    store = get_store()
    users = list(store.users.values())
    opps = list(store.opps.values())
    if not users or not opps:
        store.generate_synthetic(20, 8)
        users = list(store.users.values())
        opps = list(store.opps.values())

    user = store.users.get(user_id) if user_id else users[0]
    if not user:
        return []

    score_matrix, explanations = solver.build_score_matrix([user], opps, store)
    user_scores = score_matrix.get(user.id, {})
    scored: list[tuple[Opportunity, float]] = []
    for opp in opps:
        score = user_scores.get(opp.id)
        if score is None:
            continue
        scored.append((opp, score))

    scored.sort(key=lambda x: x[1], reverse=True)

    results: List[FrontendEvent] = []
    for opp, score in scored:
        participants = list(store.rsvps.get(opp.id, set()))
        is_full = len(participants) >= opp.capacity
        dt = opp.time or datetime.now(timezone.utc).isoformat()
        location = f"{opp.lat:.4f},{opp.lng:.4f}"
        pulse = store.prices.get(opp.id, 50.0)
        results.append(
            FrontendEvent(
                description=opp.description or opp.title,
                creator="Flok",
                dateTime=dt,
                participants=participants,
                capacity=opp.capacity,
                isFull=is_full,
                location=location,
                tags=opp.tags,
            )
        )
        store.record_feedback({"user_id": user.id, "opp_id": opp.id, "event": "shown"})
        expl = explanations.get(f"{user.id}|{opp.id}")
        if expl:
            feature_snapshot = {
                "interest": expl.breakdown.get("interest", 0.0),
                "goal_match": expl.breakdown.get("goal_match", 0.0),
                "group_match": expl.breakdown.get("group_match", 0.0),
                "travel_penalty": expl.breakdown.get("travel_penalty", 0.0),
                "intensity_mismatch": expl.breakdown.get("intensity_mismatch", 0.0),
                "novelty_bonus": expl.breakdown.get("novelty_bonus", 0.0),
                "pulse_centered": expl.breakdown.get("pulse_centered", 0.0),
                "availability_ok": 1.0,
            }
            store.log_impression(user.id, opp.id, feature_snapshot, pulse)

    return results
