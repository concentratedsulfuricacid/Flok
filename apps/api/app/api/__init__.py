from __future__ import annotations

from fastapi import APIRouter

from app.api import (
    routes_feedback,
    routes_metrics,
    routes_rebalance,
    routes_seed,
    routes_solve,
    routes_state,
)

router = APIRouter()
router.include_router(routes_seed.router)
router.include_router(routes_solve.router)
router.include_router(routes_feedback.router)
router.include_router(routes_rebalance.router)
router.include_router(routes_metrics.router)
router.include_router(routes_state.router)
