from __future__ import annotations

"""State endpoint: serve full in-memory snapshot for demos."""

from fastapi import APIRouter

from app.services.state_store import get_store

router = APIRouter()


@router.get("/state")
def state() -> dict:
    """Return the full state snapshot (users, opps, demand, assignments)."""
    store = get_store()
    return store.snapshot()
