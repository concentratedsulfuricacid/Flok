from __future__ import annotations

"""User profile endpoints."""

from fastapi import APIRouter

from app.domain.models import User, UserUpsertRequest, UserUpsertResponse
from app.services.state_store import get_store

router = APIRouter()


@router.post("/users", response_model=UserUpsertResponse)
def upsert_user(request: UserUpsertRequest) -> UserUpsertResponse:
    store = get_store()
    with store.lock:
        if request.user_id:
            user_id = request.user_id
        else:
            idx = len(store.users)
            user_id = f"u{idx}"
            while user_id in store.users:
                idx += 1
                user_id = f"u{idx}"

        user = User(
            id=user_id,
            interest_tags=request.interest_tags,
            lat=request.lat,
            lng=request.lng,
            max_travel_mins=request.max_travel_mins,
            availability=request.availability,
            group_pref=request.group_pref,
            intensity_pref=request.intensity_pref,
            goal=request.goal,
            cohort=request.cohort,
        )
        store.users[user_id] = user

    return UserUpsertResponse(user_id=user_id)
