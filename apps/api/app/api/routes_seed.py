from __future__ import annotations

"""Seed endpoint: load fixture or generate synthetic data."""

from fastapi import APIRouter, HTTPException

from app.domain.models import SeedRequest, SeedResponse
from app.services.state_store import get_store

router = APIRouter()


@router.post("/seed", response_model=SeedResponse)
def seed(request: SeedRequest) -> SeedResponse:
    """Load data into the store and initialize pricing state."""
    store = get_store()
    if request.mode == "fixture":
        if not request.fixture_path:
            raise HTTPException(status_code=400, detail="fixture_path is required")
        try:
            store.load_fixture(request.fixture_path)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    else:
        num_users = request.num_users or 50
        num_opps = request.num_opps or 20
        store.generate_synthetic(num_users, num_opps)

    return SeedResponse(
        num_users=len(store.users),
        num_opps=len(store.opps),
        prices=dict(store.prices),
    )
