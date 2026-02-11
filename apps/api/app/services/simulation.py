from __future__ import annotations

"""Synthetic data generation helpers for demos and tests."""

import random
from typing import List, Tuple

from app.domain.models import Opportunity, User

TAGS = [
    "art",
    "music",
    "sports",
    "tech",
    "outdoors",
    "food",
    "community",
    "volunteer",
    "learn",
    "fitness",
    "games",
    "wellness",
]
TIME_BUCKETS = ["weeknights", "weekends", "weekday-mornings"]
GROUP_SIZES = ["small", "medium", "large"]
INTENSITIES = ["low", "med", "high"]
CATEGORIES = ["social", "fitness", "learning", "service", "outdoors", "arts"]
COHORTS = ["newcomer", "regular", "veteran"]


def _pick_tags(rng: random.Random, k_min: int = 2, k_max: int = 4) -> List[str]:
    """Pick a random set of tags."""
    k = rng.randint(k_min, k_max)
    return rng.sample(TAGS, k=k)


def _clustered_point(rng: random.Random, centers: List[Tuple[float, float]]) -> Tuple[float, float]:
    """Sample a point near a random cluster center."""
    cx, cy = rng.choice(centers)
    return cx + rng.uniform(-0.03, 0.03), cy + rng.uniform(-0.03, 0.03)


def generate_synthetic(num_users: int, num_opps: int, seed: int | None = None) -> Tuple[List[User], List[Opportunity]]:
    """Generate a synthetic population of users and opportunities."""
    rng = random.Random(seed)
    centers = [
        (1.283, 103.851),  # CBD/Marina
        (1.333, 103.742),  # Jurong East
        (1.349, 103.944),  # Tampines
        (1.436, 103.786),  # Woodlands
    ]

    users: List[User] = []
    for i in range(num_users):
        lat, lng = _clustered_point(rng, centers)
        availability = rng.sample(TIME_BUCKETS, k=rng.randint(1, len(TIME_BUCKETS)))
        users.append(
            User(
                id=f"u{i}",
                interest_tags=_pick_tags(rng),
                lat=lat,
                lng=lng,
                max_travel_mins=rng.randint(10, 60),
                availability=availability,
                group_pref=rng.choice(GROUP_SIZES),
                intensity_pref=rng.choice(INTENSITIES),
                goal=rng.choice([None, "friends", "active", "volunteer", "learn"]),
                cohort=rng.choice([None] + COHORTS),
            )
        )

    opps: List[Opportunity] = []
    for i in range(num_opps):
        lat, lng = _clustered_point(rng, centers)
        opps.append(
            Opportunity(
                id=f"o{i}",
                title=f"Event {i}",
                tags=_pick_tags(rng),
                category=rng.choice(CATEGORIES),
                time_bucket=rng.choice(TIME_BUCKETS),
                lat=lat,
                lng=lng,
                capacity=rng.randint(5, 25),
                group_size=rng.choice(GROUP_SIZES),
                intensity=rng.choice(INTENSITIES),
                beginner_friendly=rng.choice([True, True, False]),
            )
        )
    return users, opps


def shock_popularity(store, opp_id: str | None = None, clicks: int = 15, accepts: int = 8) -> str | None:
    """Simulate a sudden popularity spike for one opportunity."""
    if not store.opps:
        return None
    if opp_id is None:
        opp_id = next(iter(store.opps.keys()))
    for _ in range(clicks):
        store.record_feedback({"user_id": "synthetic", "opp_id": opp_id, "event": "clicked"})
    for _ in range(accepts):
        store.record_feedback({"user_id": "synthetic", "opp_id": opp_id, "event": "accepted"})
    return opp_id
