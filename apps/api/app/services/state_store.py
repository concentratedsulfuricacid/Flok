from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

from app.domain.models import Interaction, Opportunity, User
from app.services import simulation


class StateStore:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.reset()

    def reset(self) -> None:
        with self.lock:
            self.users: Dict[str, User] = {}
            self.opps: Dict[str, Opportunity] = {}
            self.prices: Dict[str, float] = {}
            self.avg_fill: Dict[str, float] = {}
            self.demand_window: Dict[str, int] = {}
            self.shown_window: Dict[str, int] = {}
            self.interactions: List[Interaction] = []
            self.last_assignment: List[Tuple[str, str]] = []

    def _ensure_opp_state(self, opp_id: str) -> None:
        if opp_id not in self.prices:
            self.prices[opp_id] = 0.0
        if opp_id not in self.avg_fill:
            self.avg_fill[opp_id] = 1.0
        if opp_id not in self.demand_window:
            self.demand_window[opp_id] = 0
        if opp_id not in self.shown_window:
            self.shown_window[opp_id] = 0

    def load_fixture(self, path: str) -> None:
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
            self.demand_window = {}
            self.shown_window = {}
            self.interactions = []
            self.last_assignment = []
            for opp_id in self.opps:
                self._ensure_opp_state(opp_id)

    def generate_synthetic(self, num_users: int, num_opps: int) -> None:
        users, opps = simulation.generate_synthetic(num_users, num_opps)
        with self.lock:
            self.users = {u.id: u for u in users}
            self.opps = {o.id: o for o in opps}
            self.prices = {}
            self.avg_fill = {}
            self.demand_window = {}
            self.shown_window = {}
            self.interactions = []
            self.last_assignment = []
            for opp_id in self.opps:
                self._ensure_opp_state(opp_id)

    def record_feedback(self, event) -> None:
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
                    ts=datetime.utcnow(),
                )
            )
            if ev in {"shown", "clicked", "accepted", "declined"}:
                self.shown_window[opp_id] = self.shown_window.get(opp_id, 0) + 1
            if ev in {"clicked", "accepted"}:
                self.demand_window[opp_id] = self.demand_window.get(opp_id, 0) + 1

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "users": list(self.users.values()),
                "opps": list(self.opps.values()),
                "prices": dict(self.prices),
                "avg_fill": dict(self.avg_fill),
                "demand_window": dict(self.demand_window),
                "shown_window": dict(self.shown_window),
                "interactions": list(self.interactions),
                "last_assignment": list(self.last_assignment),
            }


_store = StateStore()


def get_store() -> StateStore:
    return _store
