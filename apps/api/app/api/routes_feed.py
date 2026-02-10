from __future__ import annotations

"""Personalized feed endpoint."""

from fastapi import APIRouter, HTTPException, Query

from app.domain.features import compute_feature_vector
from app.domain.models import FeedItem, FeedResponse
from app.optimizer import solver
from app.services.state_store import get_store

router = APIRouter()


@router.get("/feed", response_model=FeedResponse)
def feed(user_id: str = Query(...), limit: int = Query(20, ge=1, le=100)) -> FeedResponse:
    store = get_store()
    user = store.users.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    opps = list(store.opps.values())
    if not opps:
        return FeedResponse(user_id=user_id, items=[])

    score_matrix, explanations = solver.build_score_matrix([user], opps, store)
    scored = score_matrix.get(user.id, {})

    items: list[FeedItem] = []
    for opp in opps:
        score = scored.get(opp.id)
        if score is None:
            continue
        expl = explanations.get(f"{user.id}|{opp.id}")
        features, _ = compute_feature_vector(user, opp, store.interactions)
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
                fit_score=score,
                pulse=store.prices.get(opp.id, 50.0),
                availability_ok=features["availability_ok"] > 0.5,
                reasons=expl.reason_chips if expl else [],
            )
        )

    items.sort(key=lambda item: item.fit_score, reverse=True)
    return FeedResponse(user_id=user_id, items=items[:limit])
