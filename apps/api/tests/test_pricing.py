from app.domain.models import Opportunity
from app.optimizer.pricing import compute_pulses, pulse_from_demand
from app.services.state_store import StateStore


def test_pulse_range():
    store = StateStore()
    opp = Opportunity(
        id="o1",
        title="Event",
        tags=[],
        category="social",
        time_bucket="weeknights",
        lat=0.0,
        lng=0.0,
        capacity=10,
        group_size="small",
        intensity="low",
    )
    store.opps = {opp.id: opp}
    store.prices = {opp.id: 0.0}
    store.net_demand = {opp.id: 50.0}

    pulses = compute_pulses(store, capacities={opp.id: opp.capacity}, overrides={"liquidity_k": 5.0})
    pulse = pulses[opp.id]

    assert 0.0 <= pulse <= 100.0
    assert store.prices[opp.id] == pulse


def test_pulse_monotonicity():
    low = pulse_from_demand(-10.0, 5.0)
    mid = pulse_from_demand(0.0, 5.0)
    high = pulse_from_demand(10.0, 5.0)
    assert low < mid < high
