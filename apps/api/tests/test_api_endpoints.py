from fastapi.testclient import TestClient

from app.main import app
from app.services.state_store import get_store

client = TestClient(app)


def reset_store():
    store = get_store()
    store.reset()
    return store


def test_users_and_events_flow():
    store = reset_store()

    # Create user
    resp = client.post(
        "/users",
        json={
            "interests": ["music", "tech"],
            "lat": 0.0,
            "lng": 0.0,
            "availability": ["weeknights"],
            "group_pref": "small",
            "intensity_pref": "med",
        },
    )
    assert resp.status_code == 200
    user_id = resp.json()["user_id"]
    assert user_id in store.users

    # Create event
    resp = client.post(
        "/events",
        json={
            "title": "Python Workshop",
            "tags": ["tech", "learn"],
            "category": "learning",
            "time_bucket": "weeknights",
            "lat": 0.5,
            "lng": 0.5,
            "capacity": 2,
            "group_size": "small",
            "intensity": "med",
        },
    )
    assert resp.status_code == 200
    event_id = resp.json()["event_id"]
    assert event_id in store.opps

    # Event detail
    resp = client.get(f"/events/{event_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["event"]["id"] == event_id
    assert "pulse" in body
    assert body["spots_left"] == 2

    # Update event
    resp = client.patch(f"/events/{event_id}", json={"capacity": 3})
    assert resp.status_code == 200
    assert store.opps[event_id].capacity == 3

    # Feed
    resp = client.get(f"/feed?user_id={user_id}&limit=5")
    assert resp.status_code == 200
    feed = resp.json()
    assert feed["user_id"] == user_id
    assert len(feed["items"]) >= 1


def test_feedback_and_rsvp_and_explain_and_trending():
    store = reset_store()

    # Seed one user + one event
    user_id = client.post(
        "/users",
        json={
            "interests": ["music"],
            "lat": 0.0,
            "lng": 0.0,
            "availability": ["weeknights"],
            "group_pref": "small",
            "intensity_pref": "med",
        },
    ).json()["user_id"]

    event_id = client.post(
        "/events",
        json={
            "title": "Open Mic",
            "tags": ["music"],
            "category": "social",
            "time_bucket": "weeknights",
            "lat": 0.1,
            "lng": 0.1,
            "capacity": 1,
            "group_size": "small",
            "intensity": "med",
        },
    ).json()["event_id"]

    # Feedback with aliases
    resp = client.post(
        "/feedback",
        json={"user_id": user_id, "event_id": event_id, "type": "clicked"},
    )
    assert resp.status_code == 200
    assert resp.json()["demand"] > 0

    # RSVP should accept, then full on second user
    resp = client.post(f"/events/{event_id}/rsvp", json={"user_id": user_id})
    assert resp.status_code == 200
    assert resp.json()["status"] == "ACCEPTED"

    second_user = client.post(
        "/users",
        json={
            "interests": ["music"],
            "lat": 0.0,
            "lng": 0.0,
            "availability": ["weeknights"],
            "group_pref": "small",
            "intensity_pref": "med",
        },
    ).json()["user_id"]

    resp = client.post(f"/events/{event_id}/rsvp", json={"user_id": second_user})
    assert resp.status_code == 200
    assert resp.json()["status"] == "FULL"

    # Explain endpoint
    resp = client.get(f"/events/{event_id}/explain?user_id={user_id}")
    assert resp.status_code == 200
    assert resp.json()["event_id"] == event_id

    # Trending endpoint
    resp = client.get("/trending?limit=5")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) >= 1


def test_rebalance_summary():
    store = reset_store()

    # Seed minimal users/opps
    client.post(
        "/users",
        json={
            "interests": ["tech"],
            "lat": 0.0,
            "lng": 0.0,
            "availability": ["weeknights"],
            "group_pref": "small",
            "intensity_pref": "med",
        },
    )
    client.post(
        "/events",
        json={
            "title": "Workshop",
            "tags": ["tech"],
            "category": "learning",
            "time_bucket": "weeknights",
            "lat": 0.0,
            "lng": 0.0,
            "capacity": 2,
            "group_size": "small",
            "intensity": "med",
        },
    )

    resp = client.post("/rebalance", json={})
    assert resp.status_code == 200
    body = resp.json()
    assert "summary" in body
    assert "assigned_count" in body["summary"]
