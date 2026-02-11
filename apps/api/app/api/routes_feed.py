from __future__ import annotations

"""Personalized feed endpoint."""

from fastapi import APIRouter, HTTPException, Query

from app.core.config import get_settings
from app.domain.features import compute_feature_vector
from app.domain.models import FeedItem, FeedResponse
from app.optimizer import solver
from app.services.state_store import get_store

router = APIRouter()


@router.get("/feed", response_model=FeedResponse)
def feed(user_id: str = Query(...), limit: int = Query(20, ge=1, le=100)) -> FeedResponse:
    store = get_store()
    settings = get_settings()
    user = store.users.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    opps = list(store.opps.values())
    if not opps:
        return FeedResponse(user_id=user_id, items=[])

    score_matrix, explanations = solver.build_score_matrix([user], opps, store)
    scored = score_matrix.get(user.id, {})

    items: list[FeedItem] = []
    cold_ids: set[str] = set()
    cold_threshold = settings.cold_start_shown_threshold
    for opp in opps:
        score = scored.get(opp.id)
        if score is None:
            continue
        expl = explanations.get(f"{user.id}|{opp.id}")
        features, _ = compute_feature_vector(user, opp, store.interactions)
        pulse = store.prices.get(opp.id, 50.0)
        s_ml = expl.breakdown.get("s_ml", score) if expl else score
        reasons = list(expl.reason_chips) if expl else []
        shown_count = store.shown_window.get(opp.id, 0)
        if shown_count < cold_threshold:
            cold_ids.add(opp.id)
            reasons.append("New event")
        items.append(
            FeedItem(
                event_id=opp.id,
                title=opp.title,
                category=opp.category,
                time_bucket=opp.time_bucket,
                tags=opp.tags,
                lat=opp.lat,
                lng=opp.lng,
                capacity=opp.capacity,
                group_size=opp.group_size,
                intensity=opp.intensity,
                beginner_friendly=opp.beginner_friendly,
                fit_score=float(s_ml),
                pulse=float(pulse),
                availability_ok=features["availability_ok"] > 0.5,
                reasons=reasons,
            )
        )

    items.sort(key=lambda item: scored.get(item.event_id, item.fit_score), reverse=True)
    if cold_ids and settings.cold_start_share > 0:
        cold_slots = max(1, int(round(limit * settings.cold_start_share)))
        cold_slots = min(cold_slots, len(cold_ids), limit)
        selected: list[FeedItem] = []
        selected_ids: set[str] = set()
        for item in items:
            if item.event_id in cold_ids:
                selected.append(item)
                selected_ids.add(item.event_id)
                if len(selected) >= cold_slots:
                    break
        for item in items:
            if len(selected) >= limit:
                break
            if item.event_id in selected_ids:
                continue
            selected.append(item)
        items = selected
    else:
        items = items[:limit]

    # Log impressions and shown events for training data
    for item in items:
        store.record_feedback({"user_id": user_id, "opp_id": item.event_id, "event": "shown"})
        if item.event_id in scored:
            expl = explanations.get(f"{user_id}|{item.event_id}")
            features = expl.breakdown if expl else {}
            feature_snapshot = {
                "interest": features.get("interest", 0.0),
                "goal_match": features.get("goal_match", 0.0),
                "group_match": features.get("group_match", 0.0),
                "travel_penalty": features.get("travel_penalty", 0.0),
                "intensity_mismatch": features.get("intensity_mismatch", 0.0),
                "novelty_bonus": features.get("novelty_bonus", 0.0),
                "pulse_centered": features.get("pulse_centered", 0.0),
                "availability_ok": 1.0 if item.availability_ok else 0.0,
            }
            store.log_impression(user_id, item.event_id, feature_snapshot, item.pulse)

    return FeedResponse(user_id=user_id, items=items)
