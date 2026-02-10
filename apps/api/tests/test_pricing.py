from app.domain.models import Opportunity
from app.optimizer.pricing import update_prices
from app.services.state_store import StateStore


def test_price_clamping_and_smoothing():
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
    store.avg_fill = {opp.id: 0.0}
    store.demand_window = {opp.id: 50}

    deltas = update_prices(
        store,
        capacities={opp.id: opp.capacity},
        overrides={"eta": 1.0, "rho": 0.5, "p_min": -1.0, "p_max": 1.0},
    )

    # avg_fill should move toward fill=5.0
    assert store.avg_fill[opp.id] > 0.0
    # price should be clamped to p_max
    assert store.prices[opp.id] <= 1.0
    assert opp.id in deltas
