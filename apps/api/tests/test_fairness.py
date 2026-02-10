from app.domain.models import User
from app.optimizer import fairness


def test_fairness_gap():
    users = [
        User(
            id="u1",
            interest_tags=[],
            lat=0.0,
            lng=0.0,
            max_travel_mins=30,
            availability=["weeknights"],
            group_pref="small",
            intensity_pref="low",
            cohort="newcomer",
        ),
        User(
            id="u2",
            interest_tags=[],
            lat=0.0,
            lng=0.0,
            max_travel_mins=30,
            availability=["weeknights"],
            group_pref="small",
            intensity_pref="low",
            cohort="regular",
        ),
    ]
    assignments = [("u1", "o1")]
    rates = fairness.exposure_rates(users, assignments)
    gap = fairness.fairness_gap(rates)
    assert gap == 1.0
