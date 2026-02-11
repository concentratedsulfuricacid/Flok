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
        capacity=8,
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
            capacity=6,
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
            capacity=10,
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
            capacity=12,
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
            capacity=12,
            group_size="large",
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
            (high_user.id, "demo_ai"): 0.3,
            (high_user.id, "demo_yoga"): 0.2,
            (high_user.id, "demo_walk"): 0.25,
            (high_user.id, "demo_market"): 0.1,
            (mid_user.id, "demo_hot"): 0.6,
            (mid_user.id, "demo_ai"): 0.2,
            (mid_user.id, "demo_yoga"): 0.55,
            (mid_user.id, "demo_walk"): 0.5,
            (mid_user.id, "demo_market"): 0.4,
        }
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

    if request.hot_event_id:
        if request.hot_event_id not in store.opps:
            raise HTTPException(status_code=404, detail="Event not found")
        event_id = request.hot_event_id
    else:
        event_id = max(store.net_demand, key=store.net_demand.get, default=None)
        if event_id is None:
            event_id = opps[0].id
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
