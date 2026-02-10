from __future__ import annotations

"""Metrics computation for dashboard analytics."""

from typing import Dict, Iterable, List, Tuple

from app.domain.models import Assignment, MetricsResult, Opportunity, OppFill, Recommendation, User
from app.optimizer import fairness, pricing


def _gini(values: List[float]) -> float:
    """Compute Gini coefficient for a list of non-negative values."""
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    n = len(values)
    cumulative = 0.0
    for i, val in enumerate(sorted_vals, start=1):
        cumulative += i * val
    total = sum(sorted_vals)
    if total == 0:
        return 0.0
    return (2 * cumulative) / (n * total) - (n + 1) / n


def _diversity_per_user(
    users: Iterable[User],
    opps_by_id: Dict[str, Opportunity],
    recommendations: Dict[str, Recommendation] | None,
    interactions: List,
) -> Dict[str, int]:
    """Compute diversity as unique categories per user."""
    diversity: Dict[str, int] = {}
    if recommendations:
        for user_id, rec in recommendations.items():
            opp_ids = [opp_id for opp_id in [rec.primary] + rec.alternatives if opp_id]
            categories = {opps_by_id[opp_id].category for opp_id in opp_ids if opp_id in opps_by_id}
            diversity[user_id] = len(categories)
        return diversity

    # Fallback to interaction history
    for user in users:
        categories = set()
        for interaction in interactions:
            uid = getattr(interaction, "user_id", None) or interaction.get("user_id")
            if uid != user.id:
                continue
            opp_id = getattr(interaction, "opp_id", None) or interaction.get("opp_id")
            opp = opps_by_id.get(opp_id)
            if opp:
                categories.add(opp.category)
        diversity[user.id] = len(categories)
    return diversity


def compute_metrics(
    users: List[User],
    opps: List[Opportunity],
    assignments: List[Tuple[str, str]] | List[Assignment],
    store,
    recommendations: Dict[str, Recommendation] | None = None,
) -> MetricsResult:
    """Compute aggregate marketplace metrics."""
    opps_by_id = {opp.id: opp for opp in opps}
    total_capacity = sum(max(0, opp.capacity) for opp in opps)
    assigned_seats = len(assignments)
    utilization = assigned_seats / total_capacity if total_capacity else 0.0

    assigned_counts: Dict[str, int] = {}
    for assignment in assignments:
        if isinstance(assignment, Assignment):
            opp_id = assignment.opp_id
        else:
            _, opp_id = assignment
        assigned_counts[opp_id] = assigned_counts.get(opp_id, 0) + 1

    fill_by_opp: Dict[str, float] = {}
    for opp in opps:
        if opp.capacity <= 0:
            fill_by_opp[opp.id] = 0.0
        else:
            fill_by_opp[opp.id] = assigned_counts.get(opp.id, 0) / float(opp.capacity)

    avg_fill_ratio = sum(fill_by_opp.values()) / len(opps) if opps else 0.0

    assignment_pairs: List[Tuple[str, str]] = []
    for assignment in assignments:
        if isinstance(assignment, Assignment):
            assignment_pairs.append((assignment.user_id, assignment.opp_id))
        else:
            assignment_pairs.append(assignment)
    rates = fairness.exposure_rates(users, assignment_pairs)
    fair_gap = fairness.fairness_gap(rates)

    capacities = {opp.id: opp.capacity for opp in opps}
    pulse_map = pricing.compute_pulses(store, capacities)
    overdemanded: List[OppFill] = []
    for opp in opps:
        pulse = pulse_map.get(opp.id, 50.0)
        fill = pulse / 100.0
        overdemanded.append(OppFill(opp_id=opp.id, fill=fill, price=pulse))
    top_overdemanded = sorted(overdemanded, key=lambda o: o.fill, reverse=True)[:3]

    underfilled = [
        OppFill(opp_id=opp.id, fill=pulse_map.get(opp.id, 50.0) / 100.0, price=pulse_map.get(opp.id, 50.0))
        for opp in opps
    ]
    top_underfilled = sorted(underfilled, key=lambda o: o.fill)[:3]

    gini_exposure = _gini(list(assigned_counts.values()))

    diversity_per_user = _diversity_per_user(users, opps_by_id, recommendations, store.interactions)
    avg_diversity = (
        sum(diversity_per_user.values()) / len(diversity_per_user) if diversity_per_user else 0.0
    )

    return MetricsResult(
        utilization=utilization,
        avg_fill_ratio=avg_fill_ratio,
        fairness_gap=fair_gap,
        top_overdemanded=top_overdemanded,
        top_underfilled=top_underfilled,
        gini_exposure=gini_exposure,
        avg_diversity=avg_diversity,
    )
