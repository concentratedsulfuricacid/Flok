from __future__ import annotations

"""In-memory state store with thread-safety for the Flok backend."""

import json
import math
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Set, Tuple

from app.core.config import get_settings
from app.domain.models import Interaction, Opportunity, User
from app.services import simulation


class StateStore:
    """Thread-safe in-memory store for users, opps, prices, and interactions."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.reset()

    def reset(self) -> None:
        """Clear all in-memory state."""
        with self.lock:
            self.users: Dict[str, User] = {}
            self.opps: Dict[str, Opportunity] = {}
            self.prices: Dict[str, float] = {}
            self.avg_fill: Dict[str, float] = {}
            self.net_demand: Dict[str, float] = {}
            self.last_demand_ts: Dict[str, datetime] = {}
            self.shown_window: Dict[str, int] = {}
            self.interactions: List[Interaction] = []
            self.last_assignment: List[Tuple[str, str]] = []
            self.rsvps: Dict[str, Set[str]] = {}
            self.pulse_history: Dict[str, List[Tuple[str, float]]] = {}
            self.demo_score_overrides: Dict[Tuple[str, str], float] = {}
            self.demo_pricing_overrides: Dict[str, float] | None = None
            self.demo_hot_event_id: str | None = None
            self.demo_user_ids: List[str] = []
            self.demo_step_queue: Dict[str, List[str]] = {}
            self.demo_step_counts: Dict[str, int] = {}
            self.demo_actor_seq: int = 0

    def _ensure_opp_state(self, opp_id: str) -> None:
        """Initialize per-opportunity pricing and counters if missing."""
        now = datetime.now(timezone.utc)
        if opp_id not in self.prices:
            self.prices[opp_id] = 0.0
        if opp_id not in self.avg_fill:
            self.avg_fill[opp_id] = 1.0
        if opp_id not in self.net_demand:
            self.net_demand[opp_id] = 0.0
        if opp_id not in self.last_demand_ts:
            self.last_demand_ts[opp_id] = now
        if opp_id not in self.shown_window:
            self.shown_window[opp_id] = 0
        if opp_id not in self.rsvps:
            self.rsvps[opp_id] = set()
        if opp_id not in self.pulse_history:
            self.pulse_history[opp_id] = []

    def load_fixture(self, path: str) -> None:
        """Load users/opps from a JSON fixture file."""
        path_obj = Path(path)
        if not path_obj.exists():
            repo_root = Path(__file__).resolve().parents[4]
            path_obj = repo_root / path
        payload = json.loads(path_obj.read_text())
        users = payload.get("users") or payload.get("user") or []
        opps = payload.get("opps") or payload.get("opportunities") or []
        with self.lock:
            self.users = {u["id"]: User.model_validate(u) for u in users}
            self.opps = {o["id"]: Opportunity.model_validate(o) for o in opps}
            self.prices = {}
            self.avg_fill = {}
            self.net_demand = {}
            self.last_demand_ts = {}
            self.shown_window = {}
            self.interactions = []
            self.last_assignment = []
            self.rsvps = {}
            self.pulse_history = {}
            self.demo_score_overrides = {}
            self.demo_pricing_overrides = None
            self.demo_hot_event_id = None
            self.demo_user_ids = []
            self.demo_step_queue = {}
            self.demo_step_counts = {}
            self.demo_actor_seq = 0
            for opp_id in self.opps:
                self._ensure_opp_state(opp_id)

    def generate_synthetic(self, num_users: int, num_opps: int) -> None:
        """Generate synthetic users/opps for demos."""
        users, opps = simulation.generate_synthetic(num_users, num_opps)
        with self.lock:
            self.users = {u.id: u for u in users}
            self.opps = {o.id: o for o in opps}
            self.prices = {}
            self.avg_fill = {}
            self.net_demand = {}
            self.last_demand_ts = {}
            self.shown_window = {}
            self.interactions = []
            self.last_assignment = []
            self.rsvps = {}
            self.pulse_history = {}
            self.demo_score_overrides = {}
            self.demo_pricing_overrides = None
            self.demo_hot_event_id = None
            self.demo_user_ids = []
            self.demo_step_queue = {}
            self.demo_step_counts = {}
            self.demo_actor_seq = 0
            for opp_id in self.opps:
                self._ensure_opp_state(opp_id)

    def record_feedback(self, event) -> None:
        """Record an interaction and update demand/shown windows."""
        if isinstance(event, dict):
            user_id = event.get("user_id")
            opp_id = event.get("opp_id")
            ev = event.get("event")
        else:
            user_id = getattr(event, "user_id", None)
            opp_id = getattr(event, "opp_id", None)
            ev = getattr(event, "event", None)

        if not opp_id or not ev:
            return

        with self.lock:
            self._ensure_opp_state(opp_id)
            self.interactions.append(
                Interaction(
                    user_id=user_id or "unknown",
                    opp_id=opp_id,
                    event=ev,
                    ts=datetime.now(timezone.utc),
                )
            )
            if ev in {"shown", "clicked", "accepted", "declined"}:
                self.shown_window[opp_id] = self.shown_window.get(opp_id, 0) + 1

            delta = 0.0
            if ev == "accepted":
                delta = 1.0
            elif ev == "declined":
                delta = -0.5
            elif ev == "clicked":
                delta = 0.2

            if delta != 0.0:
                settings = get_settings()
                now = datetime.now(timezone.utc)
                last_ts = self.last_demand_ts.get(opp_id, now)
                tau_hours = settings.demand_decay_tau_hours
                net = self.net_demand.get(opp_id, 0.0)
                if tau_hours > 0:
                    dt = (now - last_ts).total_seconds()
                    decay = math.exp(-dt / (tau_hours * 3600.0))
                    net *= decay
                net += delta
                self.net_demand[opp_id] = net
                self.last_demand_ts[opp_id] = now

    def _resolve_data_path(self, path_str: str) -> Path:
        path = Path(path_str)
        if path.is_absolute():
            return path
        api_root = Path(__file__).resolve().parents[2]
        return api_root / path

    def log_impression(self, user_id: str, opp_id: str, features: dict, pulse: float) -> None:
        """Log an impression with feature snapshot for training."""
        settings = get_settings()
        ts = datetime.now(timezone.utc).isoformat()
        payload = {
            "user_id": user_id,
            "opp_id": opp_id,
            "ts": ts,
            "features": features,
            "pulse": pulse,
        }
        path = self._resolve_data_path(settings.rsvp_impressions_log_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")

    def log_rsvp(self, user_id: str, opp_id: str) -> None:
        """Log an RSVP event for training labels."""
        settings = get_settings()
        ts = datetime.now(timezone.utc).isoformat()
        payload = {"user_id": user_id, "opp_id": opp_id, "ts": ts}
        path = self._resolve_data_path(settings.rsvp_events_log_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")

    def snapshot(self) -> dict:
        """Return a snapshot of the current store state."""
        with self.lock:
            return {
                "users": [u.model_dump() for u in self.users.values()],
                "opps": [o.model_dump() for o in self.opps.values()],
                "prices": dict(self.prices),
                "avg_fill": dict(self.avg_fill),
                "net_demand": dict(self.net_demand),
                "shown_window": dict(self.shown_window),
                "interactions": [i.model_dump() for i in self.interactions],
                "last_assignment": list(self.last_assignment),
                "rsvps": {opp_id: list(users) for opp_id, users in self.rsvps.items()},
                "pulse_history": dict(self.pulse_history),
            }


_store = StateStore()


def get_store() -> StateStore:
    """Get the singleton state store."""
    return _store
