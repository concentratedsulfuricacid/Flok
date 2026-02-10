from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.domain.models import SolveRequest, SolveResponse
from app.metrics.compute import compute_metrics
from app.optimizer import solver
from app.services.state_store import get_store

router = APIRouter()


@router.post("/solve", response_model=SolveResponse)
def solve_route(request: SolveRequest) -> SolveResponse:
    store = get_store()
    if not store.users or not store.opps:
        raise HTTPException(status_code=400, detail="No users/opportunities loaded. Call /seed first.")

    users = list(store.users.values())
    if request.user_ids:
        user_set = set(request.user_ids)
        users = [u for u in users if u.id in user_set]

    opps = list(store.opps.values())

    weight_overrides = request.weights
    pricing_overrides = request.pricing.model_dump() if request.pricing else None

    assignments, unassigned, recommendations, explanations = solver.solve(
        users,
        opps,
        store,
        weight_overrides=weight_overrides,
        pricing_overrides=pricing_overrides,
        apply_fairness=request.enable_fairness_boost,
        lambda_fair_override=request.lambda_fair,
        top_k=request.return_top_k_alternatives,
    )

    store.last_assignment = [(a.user_id, a.opp_id) for a in assignments]

    metrics = compute_metrics(
        users,
        opps,
        store.last_assignment,
        store,
        recommendations=recommendations,
    )

    return SolveResponse(
        assignments=assignments,
        unassigned_user_ids=unassigned,
        recommendations=recommendations,
        explanations=explanations,
        prices=dict(store.prices),
        metrics=metrics,
    )
