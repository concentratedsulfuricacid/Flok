from __future__ import annotations

import math
from typing import Dict, List, Tuple

from app.core.config import get_settings
from app.domain.models import Opportunity, User

FeatureVector = Dict[str, float]


def interest_jaccard(tags_u: List[str], tags_o: List[str]) -> float:
    set_u = {t.lower() for t in tags_u if t}
    set_o = {t.lower() for t in tags_o if t}
    if not set_u and not set_o:
        return 0.0
    intersection = set_u.intersection(set_o)
    union = set_u.union(set_o)
    if not union:
        return 0.0
    return len(intersection) / len(union)


def travel_minutes(user: User, opp: Opportunity) -> float:
    settings = get_settings()
    dist = math.sqrt((user.lat - opp.lat) ** 2 + (user.lng - opp.lng) ** 2)
    return dist * settings.distance_scale_mins


def travel_penalty(user: User, opp: Opportunity) -> float:
    mins = travel_minutes(user, opp)
    if user.max_travel_mins <= 0:
        return 1.0
    return min(1.0, mins / float(user.max_travel_mins))


def availability_ok(user: User, opp: Opportunity) -> bool:
    if not user.availability:
        return True
    return opp.time_bucket in user.availability


def group_size_match(user: User, opp: Opportunity) -> float:
    mapping = {"small": 0.0, "medium": 0.5, "large": 1.0}
    pref = mapping.get(user.group_pref, 0.5)
    size = mapping.get(opp.group_size, 0.5)
    return 1.0 - abs(pref - size)


def intensity_mismatch(user: User, opp: Opportunity) -> float:
    mapping = {"low": 0.0, "med": 0.5, "high": 1.0}
    pref = mapping.get(user.intensity_pref, 0.5)
    intensity = mapping.get(opp.intensity, 0.5)
    return abs(pref - intensity)


def novelty_bonus(user: User, opp: Opportunity, interactions: List | None) -> float:
    if not interactions:
        return 0.5
    for interaction in interactions:
        uid = getattr(interaction, "user_id", None) or interaction.get("user_id")
        oid = getattr(interaction, "opp_id", None) or interaction.get("opp_id")
        if uid == user.id and oid == opp.id:
            return 0.0
    return 1.0


def compute_feature_vector(
    user: User,
    opp: Opportunity,
    interactions: List[dict] | None = None,
) -> Tuple[FeatureVector, List[str]]:
    interest = interest_jaccard(user.interest_tags, opp.tags)
    travel_mins = travel_minutes(user, opp)
    penalty = travel_penalty(user, opp)
    avail_ok = availability_ok(user, opp)
    group_match = group_size_match(user, opp)
    intensity_gap = intensity_mismatch(user, opp)
    novelty = novelty_bonus(user, opp, interactions)

    reason_chips: List[str] = []
    if interest >= 0.5:
        reason_chips.append("Matches interests")
    if penalty <= 0.3:
        reason_chips.append("Close by")
    if avail_ok:
        reason_chips.append("Fits availability")
    if group_match >= 0.7:
        reason_chips.append("Good group size")
    if intensity_gap <= 0.2:
        reason_chips.append("Comfortable intensity")
    if novelty >= 0.7:
        reason_chips.append("Fresh option")

    features: FeatureVector = {
        "interest": interest,
        "travel_minutes": travel_mins,
        "travel_penalty": penalty,
        "availability_ok": 1.0 if avail_ok else 0.0,
        "group_match": group_match,
        "intensity_mismatch": intensity_gap,
        "novelty_bonus": novelty,
    }
    return features, reason_chips
