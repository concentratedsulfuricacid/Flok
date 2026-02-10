from __future__ import annotations

import logging
from typing import Dict, Iterable, List, Tuple

from app.core.config import get_settings
from app.domain.features import compute_feature_vector
from app.domain.models import Assignment, Opportunity, Recommendation, ScoreExplanation, User
from app.optimizer import fairness, pricing

logger = logging.getLogger(__name__)

DEFAULT_WEIGHTS = {
    "w_interest": 3.0,
    "w_goal": 2.0,
    "w_group": 1.0,
    "w_travel": 3.0,
    "w_intensity": 1.0,
    "w_novelty": 0.5,
}

GOAL_HINTS = {
    "friends": {"social", "community", "hangout", "meetup"},
    "active": {"fitness", "sports", "outdoor", "active"},
    "volunteer": {"volunteer", "service", "community"},
    "learn": {"learn", "education", "workshop", "class", "training"},
}


def _goal_match(user: User, opp: Opportunity) -> float:
    if not user.goal:
        return 0.0
    hints = GOAL_HINTS.get(user.goal, set())
    haystack = " ".join([opp.category] + opp.tags).lower()
    return 1.0 if any(h in haystack for h in hints) else 0.0


def _merge_weights(overrides: Dict[str, float] | None) -> Dict[str, float]:
    merged = dict(DEFAULT_WEIGHTS)
    if overrides:
        for key, value in overrides.items():
            if key in merged and value is not None:
                merged[key] = float(value)
    return merged


def build_score_matrix(
    users: Iterable[User],
    opps: Iterable[Opportunity],
    store,
    weight_overrides: Dict[str, float] | None = None,
    pricing_overrides: Dict[str, float] | None = None,
    apply_fairness: bool = False,
    lambda_fair_override: float | None = None,
) -> Tuple[Dict[str, Dict[str, float]], Dict[str, ScoreExplanation]]:
    settings = get_settings()
    weights = _merge_weights(weight_overrides)
    pricing_cfg = pricing.get_pricing_config(pricing_overrides)
    fairness_rates = fairness.exposure_rates(users, store.last_assignment)
    lambda_fair = lambda_fair_override if lambda_fair_override is not None else settings.fairness_lambda

    score_matrix: Dict[str, Dict[str, float]] = {}
    explanations: Dict[str, ScoreExplanation] = {}

    interactions = store.interactions

    for user in users:
        score_matrix[user.id] = {}
        for opp in opps:
            features, reason_chips = compute_feature_vector(user, opp, interactions)
            if features["availability_ok"] < 0.5:
                continue

            goal_match = _goal_match(user, opp)
            base_score = (
                weights["w_interest"] * features["interest"]
                + weights["w_goal"] * goal_match
                + weights["w_group"] * features["group_match"]
                - weights["w_travel"] * features["travel_penalty"]
                - weights["w_intensity"] * features["intensity_mismatch"]
                + weights["w_novelty"] * features["novelty_bonus"]
            )

            price = store.prices.get(opp.id, 0.0)
            price_adjustment = -pricing_cfg.lambda_price * price
            score_adj = base_score + price_adjustment

            boost = fairness.fairness_boost(user, fairness_rates) if apply_fairness else 0.0
            score_final = score_adj + (lambda_fair * boost if apply_fairness else 0.0)

            score_matrix[user.id][opp.id] = score_final
            explanations[f"{user.id}|{opp.id}"] = ScoreExplanation(
                score=score_final,
                breakdown={
                    "interest": features["interest"],
                    "goal_match": goal_match,
                    "group_match": features["group_match"],
                    "travel_minutes": features["travel_minutes"],
                    "travel_penalty": features["travel_penalty"],
                    "intensity_mismatch": features["intensity_mismatch"],
                    "novelty_bonus": features["novelty_bonus"],
                    "base_score": base_score,
                    "price": price,
                    "price_adjustment": price_adjustment,
                    "fairness_boost": boost,
                    "final_score": score_final,
                },
                reason_chips=reason_chips,
            )

    return score_matrix, explanations


def solve_assignment(
    users: List[User],
    opps: List[Opportunity],
    score_matrix: Dict[str, Dict[str, float]],
    capacities: Dict[str, int],
) -> Tuple[List[Tuple[str, str]], List[str]]:
    try:
        from ortools.graph import pywrapgraph  # type: ignore

        return _solve_with_ortools(users, opps, score_matrix, capacities)
    except Exception as exc:  # pragma: no cover - fallback path
        logger.warning("Falling back to greedy solver: %s", exc)
        return _solve_greedy(users, score_matrix, capacities)


def _solve_with_ortools(
    users: List[User],
    opps: List[Opportunity],
    score_matrix: Dict[str, Dict[str, float]],
    capacities: Dict[str, int],
) -> Tuple[List[Tuple[str, str]], List[str]]:
    from ortools.graph import pywrapgraph  # type: ignore

    scores = [score for user_scores in score_matrix.values() for score in user_scores.values()]
    max_score = max(scores, default=0.0)
    if max_score < 0:
        max_score = 0.0
    scale = 100

    def cost_for(score: float) -> int:
        return int(round((max_score - score) * scale))

    unassigned_cost = cost_for(0.0)

    source = 0
    user_offset = 1
    opp_offset = 1 + len(users)
    sink = 1 + len(users) + len(opps)

    min_cost_flow = pywrapgraph.SimpleMinCostFlow()

    # Source -> users
    for i, _ in enumerate(users):
        min_cost_flow.AddArcWithCapacityAndUnitCost(source, user_offset + i, 1, 0)

    # Users -> opps and users -> sink
    for i, user in enumerate(users):
        user_node = user_offset + i
        for j, opp in enumerate(opps):
            score = score_matrix.get(user.id, {}).get(opp.id)
            if score is None:
                continue
            min_cost_flow.AddArcWithCapacityAndUnitCost(
                user_node,
                opp_offset + j,
                1,
                cost_for(score),
            )
        min_cost_flow.AddArcWithCapacityAndUnitCost(user_node, sink, 1, unassigned_cost)

    # Opps -> sink
    for j, opp in enumerate(opps):
        cap = max(0, capacities.get(opp.id, 0))
        if cap == 0:
            continue
        min_cost_flow.AddArcWithCapacityAndUnitCost(opp_offset + j, sink, cap, 0)

    min_cost_flow.SetNodeSupply(source, len(users))
    min_cost_flow.SetNodeSupply(sink, -len(users))

    status = min_cost_flow.Solve()
    if status != min_cost_flow.OPTIMAL:
        return _solve_greedy(users, score_matrix, capacities)

    assignments: List[Tuple[str, str]] = []
    assigned_users = set()

    for i, user in enumerate(users):
        user_node = user_offset + i
        for arc in range(min_cost_flow.NumArcs()):
            if min_cost_flow.Tail(arc) != user_node:
                continue
            if min_cost_flow.Flow(arc) == 0:
                continue
            head = min_cost_flow.Head(arc)
            if head == sink:
                continue
            if opp_offset <= head < sink:
                opp = opps[head - opp_offset]
                assignments.append((user.id, opp.id))
                assigned_users.add(user.id)
                break

    unassigned = [u.id for u in users if u.id not in assigned_users]
    return assignments, unassigned


def _solve_greedy(
    users: List[User],
    score_matrix: Dict[str, Dict[str, float]],
    capacities: Dict[str, int],
) -> Tuple[List[Tuple[str, str]], List[str]]:
    remaining = {opp_id: max(0, cap) for opp_id, cap in capacities.items()}
    assignments: List[Tuple[str, str]] = []
    assigned_users = set()

    for user in users:
        choices = sorted(
            score_matrix.get(user.id, {}).items(),
            key=lambda item: item[1],
            reverse=True,
        )
        for opp_id, _ in choices:
            if remaining.get(opp_id, 0) > 0:
                remaining[opp_id] -= 1
                assignments.append((user.id, opp_id))
                assigned_users.add(user.id)
                break

    unassigned = [u.id for u in users if u.id not in assigned_users]
    return assignments, unassigned


def build_recommendations(
    users: Iterable[User],
    score_matrix: Dict[str, Dict[str, float]],
    assignments: List[Tuple[str, str]],
    top_k: int,
) -> Dict[str, Recommendation]:
    assigned = {user_id: opp_id for user_id, opp_id in assignments}
    recommendations: Dict[str, Recommendation] = {}

    for user in users:
        scored = sorted(
            score_matrix.get(user.id, {}).items(),
            key=lambda item: item[1],
            reverse=True,
        )
        primary = assigned.get(user.id) or (scored[0][0] if scored else None)
        alternatives = [opp_id for opp_id, _ in scored if opp_id != primary][:top_k]
        recommendations[user.id] = Recommendation(primary=primary, alternatives=alternatives)

    return recommendations


def solve(
    users: List[User],
    opps: List[Opportunity],
    store,
    weight_overrides: Dict[str, float] | None = None,
    pricing_overrides: Dict[str, float] | None = None,
    apply_fairness: bool = False,
    lambda_fair_override: float | None = None,
    top_k: int = 3,
) -> Tuple[List[Assignment], List[str], Dict[str, Recommendation], Dict[str, ScoreExplanation]]:
    score_matrix, explanations = build_score_matrix(
        users,
        opps,
        store,
        weight_overrides=weight_overrides,
        pricing_overrides=pricing_overrides,
        apply_fairness=apply_fairness,
        lambda_fair_override=lambda_fair_override,
    )
    capacities = {opp.id: opp.capacity for opp in opps}
    assignments_raw, unassigned = solve_assignment(users, opps, score_matrix, capacities)
    assignments = [Assignment(user_id=u, opp_id=o) for u, o in assignments_raw]
    recommendations = build_recommendations(users, score_matrix, assignments_raw, top_k)
    return assignments, unassigned, recommendations, explanations
