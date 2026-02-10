from app.domain.models import Opportunity, User
from app.optimizer.solver import solve_assignment


def test_solver_feasibility():
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
        ),
    ]
    opps = [
        Opportunity(
            id="o1",
            title="Event",
            tags=[],
            category="social",
            time_bucket="weeknights",
            lat=0.0,
            lng=0.0,
            capacity=1,
            group_size="small",
            intensity="low",
        )
    ]
    score_matrix = {
        "u1": {"o1": 1.0},
        "u2": {"o1": 2.0},
    }
    assignments, unassigned = solve_assignment(
        users,
        opps,
        score_matrix,
        capacities={"o1": 1},
    )

    assert len(assignments) == 1
    assert len(unassigned) == 1
    assigned_users = {u for u, _ in assignments}
    assert len(assigned_users) == 1
