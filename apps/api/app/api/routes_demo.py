from __future__ import annotations

"""Demo simulation endpoint."""

import math
import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, HTTPException, Query

from app.domain.models import (
    DemoSetupResponse,
    DemoSimulateRequest,
    DemoSimulateResponse,
    DemoStepRequest,
    DemoStepResponse,
    DemoUserRank,
    DemoUserInfo,
    TrendingItem,
)
from app.domain.models import Opportunity, User
from app.optimizer import pricing, solver
from app.services.state_store import get_store

router = APIRouter()


def _demand_for_pulse(pulse: float, liquidity: float) -> float:
    bounded = min(max(pulse, 1.0), 99.0)
    return liquidity * math.log(bounded / (100.0 - bounded))


def _seed_step_queue(event_id: str, start_index: int, count: int) -> list[str]:
    return [f"demo_actor_{event_id}_{start_index + idx}" for idx in range(count)]


def _resolve_demo_event_id(store, requested_event_id: str | None) -> str:
    if requested_event_id:
        if requested_event_id not in store.opps:
            raise HTTPException(status_code=404, detail="Event not found")
        return requested_event_id

    demo_hot_event_id = getattr(store, "demo_hot_event_id", None)
    if demo_hot_event_id and demo_hot_event_id in store.opps:
        return demo_hot_event_id

    event_id = max(store.net_demand, key=store.net_demand.get, default=None)
    if event_id is not None and event_id in store.opps:
        return event_id

    opps = list(store.opps.values())
    if not opps:
        raise HTTPException(status_code=400, detail="No events available.")
    return opps[0].id


def _hot_event_rankings(store, hot_event_id: str) -> list[DemoUserRank]:
    demo_user_ids = [uid for uid in getattr(store, "demo_user_ids", []) if uid in store.users]
    if not demo_user_ids:
        demo_user_ids = [uid for uid in ("demo_high", "demo_mid") if uid in store.users]
    if not demo_user_ids:
        return []

    users = [store.users[uid] for uid in demo_user_ids]
    opps = list(store.opps.values())
    pricing_overrides = getattr(store, "demo_pricing_overrides", None)
    score_matrix, _ = solver.build_score_matrix(
        users,
        opps,
        store,
        pricing_overrides=pricing_overrides,
    )

    rankings: list[DemoUserRank] = []
    for user in users:
        scored = score_matrix.get(user.id, {})
        ordered = sorted(scored.items(), key=lambda item: item[1], reverse=True)
        rank = next((idx for idx, (opp_id, _) in enumerate(ordered, start=1) if opp_id == hot_event_id), None)
        hot_event_score = scored.get(hot_event_id)
        rankings.append(
            DemoUserRank(
                user_id=user.id,
                rank=rank,
                hot_event_score=float(hot_event_score) if hot_event_score is not None else None,
            )
        )
    return rankings


def _seed_demo_dataset(store) -> tuple[str, list[DemoUserInfo]]:
    store.reset()

    now = datetime.now(timezone.utc)
    hot_time = (now + timedelta(hours=20)).isoformat()
    alt_time = (now + timedelta(hours=28)).isoformat()
    weekend_time = (now + timedelta(days=2)).isoformat()

    high_user = User(
        id="demo_high",
        interest_tags=["python", "ai", "community"],
        lat=1.3728,
        lng=103.9493,
        max_travel_mins=35,
        availability=["weeknights"],
        group_pref="small",
        intensity_pref="med",
        goal="learn",
    )
    mid_user = User(
        id="demo_mid",
        interest_tags=["wellness", "yoga", "community"],
        lat=1.3722,
        lng=103.9489,
        max_travel_mins=35,
        availability=["weeknights"],
        group_pref="medium",
        intensity_pref="med",
        goal="friends",
    )

    hot_event = Opportunity(
        id="demo_hot",
        title="Hot: Python Study Jam",
        description="Bring your laptop for a guided Python study session.",
        tags=["python", "community"],
        category="learning",
        time_bucket="weeknights",
        time=hot_time,
        lat=1.373,
        lng=103.949,
        capacity=48,
        group_size="small",
        intensity="med",
        beginner_friendly=True,
    )

    opps = [
        hot_event,
        Opportunity(
            id="demo_ai",
            title="AI Reading Group",
            description="Lightweight AI reading circle.",
            tags=["ai", "python"],
            category="learning",
            time_bucket="weeknights",
            time=alt_time,
            lat=1.371,
            lng=103.948,
            capacity=42,
            group_size="small",
            intensity="med",
            beginner_friendly=True,
        ),
        Opportunity(
            id="demo_yoga",
            title="Sunset Yoga Flow",
            description="Slow flow yoga for stress relief.",
            tags=["yoga", "wellness"],
            category="fitness",
            time_bucket="weeknights",
            time=alt_time,
            lat=1.374,
            lng=103.950,
            capacity=56,
            group_size="medium",
            intensity="low",
            beginner_friendly=True,
        ),
        Opportunity(
            id="demo_walk",
            title="Community Walk",
            description="Easy-paced neighborhood walk.",
            tags=["community", "wellness"],
            category="social",
            time_bucket="weeknights",
            time=alt_time,
            lat=1.376,
            lng=103.947,
            capacity=64,
            group_size="medium",
            intensity="low",
            beginner_friendly=True,
        ),
        Opportunity(
            id="demo_market",
            title="Weekend Food Market",
            description="Explore the weekend food market together.",
            tags=["food", "community"],
            category="social",
            time_bucket="weekends",
            time=weekend_time,
            lat=1.383,
            lng=103.944,
            capacity=80,
            group_size="large",
            intensity="low",
            beginner_friendly=True,
        ),
        Opportunity(
            id="demo_boardgames",
            title="Strategy Board Games Night",
            description="Casual board game tables with rotating groups.",
            tags=["games", "community", "social"],
            category="social",
            time_bucket="weeknights",
            time=alt_time,
            lat=1.378,
            lng=103.946,
            capacity=60,
            group_size="medium",
            intensity="low",
            beginner_friendly=True,
        ),
        Opportunity(
            id="demo_run",
            title="5K Easy Run Club",
            description="Beginner-friendly evening run with pace groups.",
            tags=["fitness", "running", "wellness"],
            category="fitness",
            time_bucket="weeknights",
            time=alt_time,
            lat=1.369,
            lng=103.951,
            capacity=70,
            group_size="large",
            intensity="med",
            beginner_friendly=True,
        ),
        Opportunity(
            id="demo_photo",
            title="City Photo Walk",
            description="Golden-hour photo walk and editing tips.",
            tags=["photography", "arts", "community"],
            category="arts",
            time_bucket="weekends",
            time=weekend_time,
            lat=1.382,
            lng=103.952,
            capacity=50,
            group_size="medium",
            intensity="low",
            beginner_friendly=True,
        ),
        Opportunity(
            id="demo_brunch",
            title="Weekend Brunch Mixer",
            description="Meet new people over brunch and conversation prompts.",
            tags=["food", "community", "friends"],
            category="social",
            time_bucket="weekends",
            time=weekend_time,
            lat=1.384,
            lng=103.941,
            capacity=72,
            group_size="large",
            intensity="low",
            beginner_friendly=True,
        ),
        Opportunity(
            id="demo_dance",
            title="Beginner Street Dance Basics",
            description="Learn a short choreography in a beginner session.",
            tags=["dance", "fitness", "music"],
            category="fitness",
            time_bucket="weeknights",
            time=alt_time,
            lat=1.375,
            lng=103.953,
            capacity=54,
            group_size="medium",
            intensity="med",
            beginner_friendly=True,
        ),
        Opportunity(
            id="demo_green",
            title="Urban Gardening Workshop",
            description="Hands-on planting and garden care in community plots.",
            tags=["community", "wellness", "learn"],
            category="learning",
            time_bucket="weekends",
            time=weekend_time,
            lat=1.379,
            lng=103.939,
            capacity=46,
            group_size="medium",
            intensity="low",
            beginner_friendly=True,
        ),
    ]

    with store.lock:
        store.users = {high_user.id: high_user, mid_user.id: mid_user}
        store.opps = {opp.id: opp for opp in opps}
        store.prices = {}
        store.avg_fill = {}
        store.net_demand = {}
        store.last_demand_ts = {}
        store.shown_window = {}
        store.interactions = []
        store.last_assignment = []
        store.rsvps = {}
        store.pulse_history = {}
        store.demo_pricing_overrides = {"lambda_price": 0.01}
        store.demo_score_overrides = {
            (high_user.id, "demo_hot"): 0.9,
            (high_user.id, "demo_ai"): 0.72,
            (high_user.id, "demo_yoga"): 0.22,
            (high_user.id, "demo_walk"): 0.28,
            (high_user.id, "demo_market"): 0.18,
            (high_user.id, "demo_boardgames"): 0.35,
            (high_user.id, "demo_run"): 0.2,
            (high_user.id, "demo_photo"): 0.24,
            (high_user.id, "demo_brunch"): 0.26,
            (high_user.id, "demo_dance"): 0.3,
            (high_user.id, "demo_green"): 0.42,
            (mid_user.id, "demo_hot"): 0.6,
            (mid_user.id, "demo_ai"): 0.24,
            (mid_user.id, "demo_yoga"): 0.58,
            (mid_user.id, "demo_walk"): 0.55,
            (mid_user.id, "demo_market"): 0.48,
            (mid_user.id, "demo_boardgames"): 0.46,
            (mid_user.id, "demo_run"): 0.44,
            (mid_user.id, "demo_photo"): 0.52,
            (mid_user.id, "demo_brunch"): 0.54,
            (mid_user.id, "demo_dance"): 0.5,
            (mid_user.id, "demo_green"): 0.49,
        }
        store.demo_hot_event_id = hot_event.id
        store.demo_user_ids = [high_user.id, mid_user.id]
        initial_queue_size = max(hot_event.capacity * 10, 40)
        store.demo_step_queue = {
            hot_event.id: _seed_step_queue(hot_event.id, 0, initial_queue_size),
        }
        store.demo_step_counts = {"__global__": 0, hot_event.id: 0}
        store.demo_actor_seq = initial_queue_size
        for opp_id in store.opps:
            store._ensure_opp_state(opp_id)

    capacities = {opp.id: opp.capacity for opp in opps}
    pricing.compute_pulses(store, capacities, record_history=True)

    users = [
        DemoUserInfo(
            user_id=high_user.id,
            label="High-fit user",
            name="Avery",
            interests=high_user.interest_tags,
            availability=high_user.availability,
            goal=high_user.goal,
            max_travel_mins=high_user.max_travel_mins,
            group_pref=high_user.group_pref,
            intensity_pref=high_user.intensity_pref,
            location="Pasir Ris East",
        ),
        DemoUserInfo(
            user_id=mid_user.id,
            label="Mid-fit user",
            name="Jordan",
            interests=mid_user.interest_tags,
            availability=mid_user.availability,
            goal=mid_user.goal,
            max_travel_mins=mid_user.max_travel_mins,
            group_pref=mid_user.group_pref,
            intensity_pref=mid_user.intensity_pref,
            location="Pasir Ris East",
        ),
    ]
    return hot_event.id, users


@router.post("/demo/setup", response_model=DemoSetupResponse)
def setup_demo() -> DemoSetupResponse:
    store = get_store()
    hot_event_id, users = _seed_demo_dataset(store)
    hot_event = store.opps[hot_event_id]
    return DemoSetupResponse(hot_event_id=hot_event_id, hot_event_title=hot_event.title, users=users)


@router.post("/demo/simulate", response_model=DemoSimulateResponse)
def simulate(
    scenario: str | None = Query(None),
    request: DemoSimulateRequest | None = Body(default=None),
) -> DemoSimulateResponse:
    store = get_store()
    if not store.users or not store.opps:
        raise HTTPException(status_code=400, detail="No users/opportunities loaded. Call /seed or /users + /events first.")

    if request is None:
        request = DemoSimulateRequest()
    if scenario == "oversubscribe_one_event":
        request = request.model_copy(
            update={
                "num_users": max(request.num_users, 15),
                "accept_rate": max(request.accept_rate, 0.85),
                "click_rate": max(request.click_rate, 0.9),
            }
        )

    users = list(store.users.values())
    opps = list(store.opps.values())

    event_id = _resolve_demo_event_id(store, request.hot_event_id)
    opp = store.opps[event_id]

    capacities = {opp_item.id: opp_item.capacity for opp_item in opps}
    before_pulses = pricing.compute_pulses(store, capacities)
    before_pulse = before_pulses.get(event_id, 50.0)
    before_fill = len(store.rsvps.get(event_id, set())) / float(max(1, opp.capacity))

    if request.level is not None:
        targets = {1: 52.0, 2: 65.0, 3: 82.0}
        if request.level not in targets:
            raise HTTPException(status_code=400, detail="Level must be 1, 2, or 3.")
        target_pulse = targets[request.level]
        cfg = pricing.get_pricing_config()
        liquidity = cfg.liquidity_k * max(1, opp.capacity)
        store.net_demand[event_id] = _demand_for_pulse(target_pulse, liquidity)
        store.last_demand_ts[event_id] = datetime.now(timezone.utc)
        fill_targets = {
            1: max(1, int(round(opp.capacity * 0.25))),
            2: max(1, int(round(opp.capacity * 0.6))),
            3: max(1, int(round(opp.capacity * 0.85))),
        }
        target_fill = min(fill_targets[request.level], opp.capacity)
        with store.lock:
            store.rsvps[event_id] = {f"demo_rsvp_{idx}" for idx in range(target_fill)}
    else:
        sample_size = min(len(users), max(0, request.num_users))
        targets = random.sample(users, sample_size) if sample_size else []
        click_count = int(round(len(targets) * request.click_rate))
        accept_count = int(round(len(targets) * request.accept_rate))
        click_targets = targets[:click_count]
        accept_targets = targets[:accept_count]

        for user in click_targets:
            store.record_feedback({"user_id": user.id, "opp_id": event_id, "event": "clicked"})

        for user in accept_targets:
            with store.lock:
                rsvp_set = store.rsvps.setdefault(event_id, set())
                if len(rsvp_set) < opp.capacity:
                    rsvp_set.add(user.id)
            store.record_feedback({"user_id": user.id, "opp_id": event_id, "event": "accepted"})
            store.log_rsvp(user.id, event_id)

    after_pulses = pricing.compute_pulses(store, capacities, record_history=True)
    after_pulse = after_pulses.get(event_id, before_pulse)
    after_fill = len(store.rsvps.get(event_id, set())) / float(max(1, opp.capacity))

    deltas = {opp_id: after_pulses.get(opp_id, 0.0) - before_pulses.get(opp_id, 0.0) for opp_id in capacities}
    movers = [
        TrendingItem(
            event_id=opp_item.id,
            title=opp_item.title,
            pulse=after_pulses.get(opp_item.id, 50.0),
            pulse_delta=deltas.get(opp_item.id, 0.0),
        )
        for opp_item in opps
    ]
    movers.sort(key=lambda item: abs(item.pulse_delta), reverse=True)

    assignments, _, _, _ = solver.solve(users, opps, store)
    store.last_assignment = [(a.user_id, a.opp_id) for a in assignments]

    return DemoSimulateResponse(
        event_id=event_id,
        before_pulse=before_pulse,
        after_pulse=after_pulse,
        before_fill=before_fill,
        after_fill=after_fill,
        movers=movers[:5],
    )


@router.post("/demo/step", response_model=DemoStepResponse)
def step_demo(request: DemoStepRequest | None = Body(default=None)) -> DemoStepResponse:
    store = get_store()
    if not store.users or not store.opps:
        raise HTTPException(status_code=400, detail="No users/opportunities loaded. Call /demo/setup first.")

    request = request or DemoStepRequest()
    opps = list(store.opps.values())
    hot_event_id = _resolve_demo_event_id(store, request.hot_event_id)

    if request.mode == "random":
        available_ids = [opp_item.id for opp_item in opps if len(store.rsvps.get(opp_item.id, set())) < opp_item.capacity]
        event_id = random.choice(available_ids) if available_ids else hot_event_id
    else:
        event_id = hot_event_id
    opp = store.opps[event_id]

    capacities = {opp_item.id: opp_item.capacity for opp_item in opps}
    before_pulses = pricing.compute_pulses(store, capacities)
    before_pulse = before_pulses.get(event_id, 50.0)

    with store.lock:
        queue_by_event = getattr(store, "demo_step_queue", {})
        step_counts = getattr(store, "demo_step_counts", {})
        global_step_key = "__global__"
        queue = queue_by_event.setdefault(event_id, [])

        refill_size = max(20, opp.capacity * 4)
        if len(queue) < request.rsvps_per_step:
            start_index = getattr(store, "demo_actor_seq", 0)
            queue.extend(_seed_step_queue(event_id, start_index, refill_size))
            store.demo_actor_seq = start_index + refill_size

        rsvp_set = store.rsvps.setdefault(event_id, set())
        actors_added: list[str] = []
        for _ in range(request.rsvps_per_step):
            if len(rsvp_set) >= opp.capacity:
                break
            if not queue:
                start_index = getattr(store, "demo_actor_seq", 0)
                queue.extend(_seed_step_queue(event_id, start_index, refill_size))
                store.demo_actor_seq = start_index + refill_size
            actor_id = queue.pop(0)
            if actor_id in rsvp_set:
                continue
            rsvp_set.add(actor_id)
            actors_added.append(actor_id)

        step_counts[event_id] = step_counts.get(event_id, 0) + 1
        step_counts[global_step_key] = step_counts.get(global_step_key, 0) + 1
        step = step_counts[global_step_key]
        rsvp_count = len(rsvp_set)

    for actor_id in actors_added:
        store.record_feedback({"user_id": actor_id, "opp_id": event_id, "event": "accepted"})
        store.log_rsvp(actor_id, event_id)

    after_pulses = pricing.compute_pulses(store, capacities, record_history=True)
    after_pulse = after_pulses.get(event_id, before_pulse)

    users = list(store.users.values())
    assignments, _, _, _ = solver.solve(users, opps, store)
    store.last_assignment = [(a.user_id, a.opp_id) for a in assignments]

    return DemoStepResponse(
        event_id=event_id,
        mode=request.mode,
        before_pulse=before_pulse,
        after_pulse=after_pulse,
        rsvp_count=rsvp_count,
        spots_left=max(0, opp.capacity - rsvp_count),
        capacity=opp.capacity,
        step=step,
        added_rsvps=len(actors_added),
        user_ranks=_hot_event_rankings(store, hot_event_id),
    )
