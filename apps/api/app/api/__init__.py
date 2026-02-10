from __future__ import annotations

from fastapi import APIRouter

from app.api import (
    routes_events,
    routes_feedback,
    routes_feed,
    routes_metrics,
    routes_rebalance,
    routes_seed,
    routes_solve,
    routes_trending,
    routes_users,
)

router = APIRouter()
router.include_router(routes_seed.router)
router.include_router(routes_solve.router)
router.include_router(routes_feed.router)
router.include_router(routes_feedback.router)
router.include_router(routes_rebalance.router)
router.include_router(routes_metrics.router)
router.include_router(routes_users.router)
router.include_router(routes_feed.router)
router.include_router(routes_events.router)
router.include_router(routes_trending.router)
