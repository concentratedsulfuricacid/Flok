from __future__ import annotations

from typing import Dict, Iterable, List, Tuple

from app.domain.models import User


def exposure_rates(users: Iterable[User], assignments: List[Tuple[str, str]]) -> Dict[str, float]:
    cohort_totals: Dict[str, int] = {}
    cohort_assigned: Dict[str, int] = {}
    user_map = {u.id: u for u in users}

    for u in users:
        if u.cohort is None:
            continue
        cohort_totals[u.cohort] = cohort_totals.get(u.cohort, 0) + 1

    for user_id, _ in assignments:
        user = user_map.get(user_id)
        if not user or user.cohort is None:
            continue
        cohort_assigned[user.cohort] = cohort_assigned.get(user.cohort, 0) + 1

    rates: Dict[str, float] = {}
    for cohort, total in cohort_totals.items():
        assigned = cohort_assigned.get(cohort, 0)
        rates[cohort] = assigned / float(total) if total > 0 else 0.0
    return rates


def fairness_gap(rates: Dict[str, float]) -> float:
    if not rates:
        return 0.0
    return max(rates.values()) - min(rates.values())


def fairness_boost(user: User, rates: Dict[str, float]) -> float:
    if user.cohort is None or not rates:
        return 0.0
    max_rate = max(rates.values())
    user_rate = rates.get(user.cohort, 0.0)
    return max(0.0, max_rate - user_rate)
