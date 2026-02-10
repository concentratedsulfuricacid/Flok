from app.domain.features import compute_feature_vector
from app.domain.models import Opportunity, User


def test_feature_ranges():
    user = User(
        id="u1",
        interest_tags=["music", "tech"],
        lat=0.0,
        lng=0.0,
        max_travel_mins=30,
        availability=["weeknights"],
        group_pref="small",
        intensity_pref="med",
        goal="learn",
        cohort="newcomer",
    )
    opp = Opportunity(
        id="o1",
        title="Workshop",
        tags=["tech"],
        category="learning",
        time_bucket="weeknights",
        lat=1.0,
        lng=1.0,
        capacity=10,
        group_size="small",
        intensity="med",
    )

    features, _ = compute_feature_vector(user, opp, interactions=[])

    for key in ["interest", "travel_penalty", "group_match", "intensity_mismatch", "novelty_bonus"]:
        assert 0.0 <= features[key] <= 1.0
    assert features["availability_ok"] in (0.0, 1.0)
