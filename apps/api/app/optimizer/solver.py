from __future__ import annotations

"""Assignment solver and scoring pipeline for user-opportunity matching."""

import logging
from typing import Dict, Iterable, List, Tuple

from app.core.config import get_settings
from app.domain.features import compute_feature_vector
from app.domain.models import Assignment, Opportunity, Recommendation, ScoreExplanation, User
from app.ml import build_ml_feature_dict, get_model
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
    """Return 1.0 if the opportunity aligns with user's goal, else 0.0."""
    if not user.goal:
        return 0.0
    hints = GOAL_HINTS.get(user.goal, set())
    haystack = " ".join([opp.category] + opp.tags).lower()
    return 1.0 if any(h in haystack for h in hints) else 0.0


def _merge_weights(overrides: Dict[str, float] | None) -> Dict[str, float]:
    """Merge default weights with optional overrides."""
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
    """Compute score matrix and explanations for all user-opportunity pairs."""
    settings = get_settings()
    weights = _merge_weights(weight_overrides)
    pricing_cfg = pricing.get_pricing_config(pricing_overrides)
    fairness_rates = fairness.exposure_rates(users, store.last_assignment)
    lambda_fair = lambda_fair_override if lambda_fair_override is not None else settings.fairness_lambda

    score_matrix: Dict[str, Dict[str, float]] = {}
    explanations: Dict[str, ScoreExplanation] = {}

    interactions = store.interactions
    capacities = {opp.id: opp.capacity for opp in opps}
    pulse_map = pricing.compute_pulses(store, capacities, overrides=pricing_overrides)

    newcomer_labels = {"newcomer", "first_time", "first-time", "new"}
    for user in users:
        score_matrix[user.id] = {}
        is_newcomer = bool(user.cohort and user.cohort.lower() in newcomer_labels)
        for opp in opps:
            features, reason_chips = compute_feature_vector(user, opp, interactions)
            if features["availability_ok"] < 0.5:
                continue

            goal_match = _goal_match(user, opp)
            pulse = pulse_map.get(opp.id, 50.0)
            pulse_centered = pulse - 50.0
            ml_features = build_ml_feature_dict(
                interest=features["interest"],
                goal_match=goal_match,
                group_match=features["group_match"],
                travel_penalty=features["travel_penalty"],
                intensity_mismatch=features["intensity_mismatch"],
                novelty_bonus=features["novelty_bonus"],
                pulse_centered=pulse_centered,
                availability_ok=features["availability_ok"],
            )
            s_ml_raw = get_model().predict_proba(ml_features)
            s_ml = s_ml_raw
            newcomer_boost = 0.0
            if is_newcomer and opp.beginner_friendly and settings.newcomer_boost > 0:
                newcomer_boost = settings.newcomer_boost
                s_ml = min(1.0, s_ml_raw * (1.0 + newcomer_boost))
                reason_chips = list(reason_chips) + ["Beginner-friendly for newcomers"]
            price_adjustment = -pricing_cfg.lambda_price * pulse_centered
            score_adj = s_ml + price_adjustment

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
                    "s_ml_raw": s_ml_raw,
                    "newcomer_boost": newcomer_boost,
                    "s_ml": s_ml,
                    "price": pulse,
                    "pulse_centered": pulse_centered,
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
    """Solve capacity-constrained assignment with OR-Tools or greedy fallback."""
    try:
        from ortools.graph import pywrapgraph  # type: ignore

        return _solve_with_ortools(users, opps, score_matrix, capacities)
    except Exception as exc:  # pragma: no cover - fallback path
        logger.warning("OR-Tools unavailable (%s). Trying NetworkX fallback.", exc)
        try:
            return _solve_with_networkx(users, opps, score_matrix, capacities)
        except Exception as nx_exc:  # pragma: no cover - fallback path
            logger.warning("Falling back to greedy solver: %s", nx_exc)
            return _solve_greedy(users, score_matrix, capacities)


def _solve_with_ortools(
    users: List[User],
    opps: List[Opportunity],
    score_matrix: Dict[str, Dict[str, float]],
    capacities: Dict[str, int],
) -> Tuple[List[Tuple[str, str]], List[str]]:
    """Solve with OR-Tools min-cost flow (allows unassigned users)."""
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


def _solve_with_networkx(
    users: List[User],
    opps: List[Opportunity],
    score_matrix: Dict[str, Dict[str, float]],
    capacities: Dict[str, int],
) -> Tuple[List[Tuple[str, str]], List[str]]:
    """Solve with NetworkX min-cost flow (allows unassigned users)."""
    import networkx as nx  # type: ignore

    scores = [score for user_scores in score_matrix.values() for score in user_scores.values()]
    max_score = max(scores, default=0.0)
    if max_score < 0:
        max_score = 0.0
    scale = 100

    def cost_for(score: float) -> int:
        return int(round((max_score - score) * scale))

    unassigned_cost = cost_for(0.0)

    G = nx.DiGraph()
    source = "source"
    sink = "sink"
    G.add_node(source, demand=-len(users))
    G.add_node(sink, demand=len(users))

    # Source -> users
    for user in users:
        user_node = f"user:{user.id}"
        G.add_node(user_node, demand=0)
        G.add_edge(source, user_node, capacity=1, weight=0)

    # Users -> opps and users -> sink
    for user in users:
        user_node = f"user:{user.id}"
        for opp in opps:
            score = score_matrix.get(user.id, {}).get(opp.id)
            if score is None:
                continue
            opp_node = f"opp:{opp.id}"
            if opp_node not in G:
                cap = max(0, capacities.get(opp.id, 0))
                if cap > 0:
                    G.add_node(opp_node, demand=0)
                    G.add_edge(opp_node, sink, capacity=cap, weight=0)
            if opp_node in G:
                G.add_edge(user_node, opp_node, capacity=1, weight=cost_for(score))
        G.add_edge(user_node, sink, capacity=1, weight=unassigned_cost)

    flow = nx.min_cost_flow(G)

    assignments: List[Tuple[str, str]] = []
    assigned_users = set()

    for user in users:
        user_node = f"user:{user.id}"
        user_flow = flow.get(user_node, {})
        for node, amount in user_flow.items():
            if amount <= 0:
                continue
            if isinstance(node, str) and node.startswith("opp:"):
                opp_id = node.split("opp:", 1)[1]
                assignments.append((user.id, opp_id))
                assigned_users.add(user.id)
                break

    unassigned = [u.id for u in users if u.id not in assigned_users]
    return assignments, unassigned


def _solve_greedy(
    users: List[User],
    score_matrix: Dict[str, Dict[str, float]],
    capacities: Dict[str, int],
) -> Tuple[List[Tuple[str, str]], List[str]]:
    """Greedy fallback assignment used if OR-Tools is unavailable."""
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
    """Build primary + alternative recommendations per user."""
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
    """End-to-end solver: score, assign, and generate recommendations."""
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
