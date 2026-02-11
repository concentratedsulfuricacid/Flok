from __future__ import annotations

"""Demo simulation endpoint."""

import json
from pathlib import Path
import random

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import JSONResponse

from app.domain.models import DemoSimulateRequest, DemoSimulateResponse, TrendingItem
from app.optimizer import pricing, solver
from app.services.state_store import get_store

router = APIRouter()
REPO_ROOT = Path(__file__).resolve().parents[4]
DEMO_USER_PATH = REPO_ROOT / "WinUi" / "public" / "demoUser.json"
FALLBACK_DEMO_USER = {
    "name": "Demo User",
    "age": 29,
    "location": "40.7128,-74.0060",
    "interests": ["walking", "coffee", "music"],
    "fitnessLevel": 6,
}


@router.get("/demoUser.json")
def demo_user_json() -> JSONResponse:
    if DEMO_USER_PATH.exists():
        return JSONResponse(content=json.loads(DEMO_USER_PATH.read_text(encoding="utf-8")))
    return JSONResponse(content=FALLBACK_DEMO_USER)


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
