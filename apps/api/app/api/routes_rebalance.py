from __future__ import annotations

"""Rebalance endpoint: update prices and recompute assignments."""

from fastapi import APIRouter, HTTPException

from app.domain.models import RebalanceResponse, RebalanceSummary, SolveRequest, TrendingItem
from app.metrics.compute import compute_metrics
from app.optimizer import pricing, solver
from app.services.state_store import get_store

router = APIRouter()


@router.post("/rebalance", response_model=RebalanceResponse)
def rebalance(request: SolveRequest) -> RebalanceResponse:
    """Update prices from demand and re-run the solver."""
    store = get_store()
    if not store.users or not store.opps:
        raise HTTPException(status_code=400, detail="No users/opportunities loaded. Call /seed first.")

    users = list(store.users.values())
    if request.user_ids:
        user_set = set(request.user_ids)
        users = [u for u in users if u.id in user_set]

    opps = list(store.opps.values())
    pricing_overrides = request.pricing.model_dump() if request.pricing else None
    capacities = {opp.id: opp.capacity for opp in opps}
    old_prices = dict(store.prices)
    pulse_map = pricing.compute_pulses(store, capacities, overrides=pricing_overrides, record_history=True)
    deltas = {opp_id: pulse_map.get(opp_id, 0.0) - old_prices.get(opp_id, 0.0) for opp_id in capacities}

    assignments, unassigned, recommendations, explanations = solver.solve(
        users,
        opps,
        store,
        weight_overrides=request.weights,
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

    pulse_movers = [
        TrendingItem(
            event_id=opp.id,
            title=opp.title,
            pulse=store.prices.get(opp.id, 50.0),
            pulse_delta=deltas.get(opp.id, 0.0),
        )
        for opp in opps
    ]
    pulse_movers.sort(key=lambda item: abs(item.pulse_delta), reverse=True)

    summary = RebalanceSummary(
        assigned_count=len(assignments),
        unassigned_count=len(unassigned),
        top_pulse_movers=pulse_movers[:3],
    )

    return RebalanceResponse(
        assignments=assignments,
        unassigned_user_ids=unassigned,
        recommendations=recommendations,
        explanations=explanations,
        prices=dict(store.prices),
        metrics=metrics,
        price_deltas=deltas,
        summary=summary,
    )
