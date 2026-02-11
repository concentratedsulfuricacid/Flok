from __future__ import annotations

"""Legacy/Frontend-compatible API endpoints under /api."""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.domain.features import compute_feature_vector
from app.domain.models import Opportunity, User
from app.optimizer import solver
from app.services import simulation
from app.services.state_store import get_store

router = APIRouter(prefix="/api")


class FrontendEvent(BaseModel):
    id: str
    description: str
    creator: str
    dateTime: str
    participants: List[str] = Field(default_factory=list)
    capacity: int
    isFull: bool
    location: str
    tags: List[str] = Field(default_factory=list)
    imageUrl: Optional[str] = None
    fitScore: Optional[float] = None
    pulse: Optional[float] = None
    reasons: List[str] = Field(default_factory=list)
    eligible: bool = True
    blocked_reasons: List[str] = Field(default_factory=list)
    blocked_reason_text: List[str] = Field(default_factory=list)
    s_adj: Optional[float] = None


class FrontendEventCreate(BaseModel):
    description: str
    creator: str
    dateTime: str
    participants: List[str] = Field(default_factory=list)
    capacity: int
    isFull: bool
    location: str
    tags: List[str] = Field(default_factory=list)
    imageUrl: Optional[str] = None


class FrontendFriend(BaseModel):
    id: Optional[str] = None
    name: str


class FrontendUserCreate(BaseModel):
    interests: List[str] = Field(default_factory=list)
    location: Optional[str] = None
    availability: List[str] = Field(default_factory=lambda: ["weeknights", "weekends"])
    goal: Optional[str] = None


class FrontendRSVPRequest(BaseModel):
    user_id: str


class FrontendRSVPResponse(BaseModel):
    event_id: str
    status: str
    spots_left: int


@router.get("/friends", response_model=List[FrontendFriend])
def friends() -> List[FrontendFriend]:
    store = get_store()
    users = list(store.users.values())
    if not users:
        return []
    return [FrontendFriend(id=u.id, name=f"Friend {u.id}") for u in users]


@router.post("/users", response_model=dict)
def create_user(payload: FrontendUserCreate) -> dict:
    store = get_store()
    with store.lock:
        idx = len(store.users)
        user_id = f"u{idx}"
        while user_id in store.users:
            idx += 1
            user_id = f"u{idx}"

        lat, lng = 0.0, 0.0
        if payload.location and "," in payload.location:
            try:
                lat_str, lng_str = payload.location.split(",", 1)
                lat = float(lat_str.strip())
                lng = float(lng_str.strip())
            except ValueError:
                pass

        user = User(
            id=user_id,
            interest_tags=payload.interests,
            lat=lat,
            lng=lng,
            max_travel_mins=30,
            availability=payload.availability,
            group_pref="medium",
            intensity_pref="med",
            goal=payload.goal if payload.goal in {"friends", "active", "volunteer", "learn"} else None,
        )
        store.users[user_id] = user

    return {"user_id": user_id}


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
            image_url=event.imageUrl,
        )
        store.opps[event_id] = opp
        store._ensure_opp_state(event_id)

    return {"id": event_id}


def _haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    r = 6371.0
    d_lat = radians(b_lat - a_lat)
    d_lng = radians(b_lng - a_lng)
    la1 = radians(a_lat)
    la2 = radians(b_lat)
    h = sin(d_lat / 2) ** 2 + cos(la1) * cos(la2) * sin(d_lng / 2) ** 2
    return 2 * r * asin(sqrt(h))


def _eligibility(
    user: User,
    opp: Opportunity,
    participants: List[str],
    interactions,
) -> tuple[bool, List[str], List[str]]:
    blocked: List[str] = []
    blocked_text: List[str] = []

    features, _ = compute_feature_vector(user, opp, interactions)
    availability_ok = features["availability_ok"] > 0.5
    if not availability_ok:
        blocked.append("NOT_IN_AVAILABILITY")
        suffix = f" ({opp.time_bucket})" if opp.time_bucket else ""
        blocked_text.append(f"Not in your availability{suffix}")

    # Distance check only if both user and opp have non-zero coords.
    distance_km = None
    if (user.lat or user.lng) and (opp.lat or opp.lng):
        distance_km = _haversine_km(user.lat, user.lng, opp.lat, opp.lng)
        if features["travel_penalty"] >= 1.0:
            blocked.append("TOO_FAR")
            blocked_text.append(f"Too far ({distance_km:.1f} km away)")

    is_full = len(participants) >= opp.capacity
    if is_full:
        blocked.append("FULL")
        blocked_text.append("Full")

    eligible = len(blocked) == 0
    return eligible, blocked, blocked_text


def _parse_dt(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.max


@router.get("/events", response_model=List[FrontendEvent])
def list_events(user_id: Optional[str] = Query(None)) -> List[FrontendEvent]:
    store = get_store()
    users = list(store.users.values())
    opps = list(store.opps.values())
    if not opps and users:
        _, gen_opps = simulation.generate_synthetic(0, 8)
        with store.lock:
            store.opps = {o.id: o for o in gen_opps}
            for opp_id in store.opps:
                store._ensure_opp_state(opp_id)
        opps = list(store.opps.values())
    elif not users or not opps:
        store.generate_synthetic(20, 8)
        users = list(store.users.values())
        opps = list(store.opps.values())

    user = store.users.get(user_id) if user_id else (users[0] if users else None)
    explanations = {}
    if user:
        score_matrix, explanations = solver.build_score_matrix([user], opps, store)
        user_scores = score_matrix.get(user.id, {})
    else:
        from app.optimizer import pricing

        capacities = {opp.id: opp.capacity for opp in opps}
        pricing.compute_pulses(store, capacities)
        user_scores = {}

    results: List[FrontendEvent] = []
    for opp in opps:
        participants = list(store.rsvps.get(opp.id, set()))
        is_full = len(participants) >= opp.capacity
        dt = opp.time or datetime.now(timezone.utc).isoformat()
        location = f"{opp.lat:.4f},{opp.lng:.4f}"
        pulse = store.prices.get(opp.id, 50.0)
        expl = explanations.get(f"{user.id}|{opp.id}") if user else None
        score = user_scores.get(opp.id) if user else None
        eligible = True
        blocked_reasons: List[str] = []
        blocked_reason_text: List[str] = []
        if user:
            eligible, blocked_reasons, blocked_reason_text = _eligibility(
                user,
                opp,
                participants,
                store.interactions,
            )
        s_ml = expl.breakdown.get("s_ml", score) if expl and score is not None else None
        reasons = expl.reason_chips if expl else []
        if not eligible:
            s_ml = None
            reasons = []
            score = None
        results.append(
            FrontendEvent(
                id=opp.id,
                description=opp.description or opp.title,
                creator="Flok",
                dateTime=dt,
                participants=participants,
                capacity=opp.capacity,
                isFull=is_full,
                location=location,
                tags=opp.tags,
                imageUrl=opp.image_url,
                fitScore=float(s_ml) if s_ml is not None else None,
                pulse=float(pulse),
                reasons=reasons,
                eligible=eligible,
                blocked_reasons=blocked_reasons,
                blocked_reason_text=blocked_reason_text,
                s_adj=float(score) if score is not None else None,
            )
        )
        if user and eligible:
            store.record_feedback({"user_id": user.id, "opp_id": opp.id, "event": "shown"})
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

    results.sort(key=lambda item: item.dateTime)
    return results


@router.get("/events/recommended", response_model=List[FrontendEvent])
def recommended_events(user_id: Optional[str] = Query(None)) -> List[FrontendEvent]:
    store = get_store()
    users = list(store.users.values())
    opps = list(store.opps.values())
    if not opps and users:
        _, gen_opps = simulation.generate_synthetic(0, 8)
        with store.lock:
            store.opps = {o.id: o for o in gen_opps}
            for opp_id in store.opps:
                store._ensure_opp_state(opp_id)
        opps = list(store.opps.values())
    elif not users or not opps:
        store.generate_synthetic(20, 8)
        users = list(store.users.values())
        opps = list(store.opps.values())

    user = store.users.get(user_id) if user_id else users[0]
    if not user:
        return []

    pricing_overrides = getattr(store, "demo_pricing_overrides", None)
    score_matrix, explanations = solver.build_score_matrix(
        [user],
        opps,
        store,
        pricing_overrides=pricing_overrides,
    )
    user_scores = score_matrix.get(user.id, {})

    eligible_items: list[tuple[float, FrontendEvent]] = []
    blocked_items: list[tuple[datetime, FrontendEvent]] = []

    for opp in opps:
        participants = list(store.rsvps.get(opp.id, set()))
        is_full = len(participants) >= opp.capacity
        dt = opp.time or datetime.now(timezone.utc).isoformat()
        location = f"{opp.lat:.4f},{opp.lng:.4f}"
        pulse = store.prices.get(opp.id, 50.0)

        score = user_scores.get(opp.id)
        expl = explanations.get(f"{user.id}|{opp.id}")
        eligible, blocked_reasons, blocked_reason_text = _eligibility(
            user,
            opp,
            participants,
            store.interactions,
        )

        s_ml = expl.breakdown.get("s_ml", score) if expl and score is not None else None
        reasons = expl.reason_chips if expl else []
        if not eligible:
            s_ml = None
            reasons = []
            score = None

        event = FrontendEvent(
            id=opp.id,
            description=opp.description or opp.title,
            creator="Flok",
            dateTime=dt,
            participants=participants,
            capacity=opp.capacity,
            isFull=is_full,
            location=location,
            tags=opp.tags,
            imageUrl=opp.image_url,
            fitScore=float(s_ml) if s_ml is not None else None,
            pulse=float(pulse),
            reasons=reasons,
            eligible=eligible,
            blocked_reasons=blocked_reasons,
            blocked_reason_text=blocked_reason_text,
            s_adj=float(score) if score is not None else None,
        )

        if eligible and score is not None:
            eligible_items.append((float(score), event))
            store.record_feedback({"user_id": user.id, "opp_id": opp.id, "event": "shown"})
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
        else:
            blocked_items.append((_parse_dt(dt), event))

    eligible_items.sort(key=lambda item: item[0], reverse=True)
    blocked_items.sort(key=lambda item: item[0])
    results = [item for _, item in eligible_items] + [item for _, item in blocked_items]
    return results


@router.post("/events/{event_id}/rsvp", response_model=FrontendRSVPResponse)
def rsvp_event(event_id: str, payload: FrontendRSVPRequest) -> FrontendRSVPResponse:
    store = get_store()
    with store.lock:
        opp = store.opps.get(event_id)
        if not opp:
            raise HTTPException(status_code=404, detail="Event not found")
        if payload.user_id not in store.users:
            raise HTTPException(status_code=404, detail="User not found")

        rsvp_set = store.rsvps.setdefault(event_id, set())
        if payload.user_id in rsvp_set:
            spots_left = max(0, opp.capacity - len(rsvp_set))
            return FrontendRSVPResponse(event_id=event_id, status="CONFIRMED", spots_left=spots_left)

        if len(rsvp_set) >= opp.capacity:
            return FrontendRSVPResponse(event_id=event_id, status="FULL", spots_left=0)

        rsvp_set.add(payload.user_id)
        spots_left = max(0, opp.capacity - len(rsvp_set))

    store.record_feedback({"user_id": payload.user_id, "opp_id": event_id, "event": "accepted"})
    return FrontendRSVPResponse(event_id=event_id, status="CONFIRMED", spots_left=spots_left)


@router.delete("/events/{event_id}/rsvp", response_model=FrontendRSVPResponse)
def unrsvp_event(event_id: str, payload: FrontendRSVPRequest) -> FrontendRSVPResponse:
    store = get_store()
    with store.lock:
        opp = store.opps.get(event_id)
        if not opp:
            raise HTTPException(status_code=404, detail="Event not found")
        if payload.user_id not in store.users:
            raise HTTPException(status_code=404, detail="User not found")

        rsvp_set = store.rsvps.setdefault(event_id, set())
        if payload.user_id in rsvp_set:
            rsvp_set.remove(payload.user_id)
        spots_left = max(0, opp.capacity - len(rsvp_set))

    store.record_feedback({"user_id": payload.user_id, "opp_id": event_id, "event": "declined"})
    return FrontendRSVPResponse(event_id=event_id, status="CANCELLED", spots_left=spots_left)
