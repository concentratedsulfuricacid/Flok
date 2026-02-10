
from __future__ import annotations

"""Train a simple logistic regression RSVP model from impression logs."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

import numpy as np

from app.core.config import get_settings
from app.ml.rsvp_model import FEATURE_ORDER


def parse_ts(ts: str) -> datetime:
    return datetime.fromisoformat(ts).astimezone(timezone.utc)


def resolve_path(path_str: str) -> Path:
    path = Path(path_str)
    if path.is_absolute():
        return path
    api_root = Path(__file__).resolve().parents[1]
    return api_root / path


def load_jsonl(path: Path) -> List[dict]:
    if not path.exists():
        return []
    items: List[dict] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        items.append(json.loads(line))
    return items


def build_dataset(impressions: List[dict], rsvps: List[dict], horizon_hours: float) -> tuple[np.ndarray, np.ndarray]:
    rsvp_map: Dict[tuple[str, str], List[datetime]] = {}
    for rsvp in rsvps:
        key = (rsvp.get("user_id"), rsvp.get("opp_id"))
        if not key[0] or not key[1]:
            continue
        rsvp_map.setdefault(key, []).append(parse_ts(rsvp["ts"]))

    xs: List[List[float]] = []
    ys: List[float] = []

    horizon = horizon_hours * 3600.0

    for imp in impressions:
        user_id = imp.get("user_id")
        opp_id = imp.get("opp_id")
        ts = imp.get("ts")
        features = imp.get("features", {})
        if not user_id or not opp_id or not ts:
            continue
        ts_dt = parse_ts(ts)

        label = 0.0
        for rsvp_time in rsvp_map.get((user_id, opp_id), []):
            if 0 <= (rsvp_time - ts_dt).total_seconds() <= horizon:
                label = 1.0
                break

        row = [float(features.get(name, 0.0)) for name in FEATURE_ORDER]
        xs.append(row)
        ys.append(label)

    if not xs:
        return np.zeros((0, len(FEATURE_ORDER))), np.zeros((0,))

    return np.array(xs, dtype=float), np.array(ys, dtype=float)


def train_logistic_regression(x: np.ndarray, y: np.ndarray, lr: float, epochs: int) -> tuple[np.ndarray, float]:
    n, d = x.shape
    w = np.zeros(d, dtype=float)
    b = 0.0

    for _ in range(epochs):
        z = x @ w + b
        preds = 1 / (1 + np.exp(-z))
        grad_w = (x.T @ (preds - y)) / n
        grad_b = float(np.mean(preds - y))
        w -= lr * grad_w
        b -= lr * grad_b

    return w, b


def main() -> None:
    settings = get_settings()

    parser = argparse.ArgumentParser()
    parser.add_argument("--impressions", default=settings.rsvp_impressions_log_path)
    parser.add_argument("--rsvps", default=settings.rsvp_events_log_path)
    parser.add_argument("--output", default=settings.rsvp_model_path)
    parser.add_argument("--horizon-hours", type=float, default=24.0)
    parser.add_argument("--lr", type=float, default=0.1)
    parser.add_argument("--epochs", type=int, default=200)
    args = parser.parse_args()

    impressions_path = resolve_path(args.impressions)
    rsvps_path = resolve_path(args.rsvps)
    impressions = load_jsonl(impressions_path)
    rsvps = load_jsonl(rsvps_path)
    print(f"Impressions path: {impressions_path} (rows={len(impressions)})")
    print(f"RSVPs path: {rsvps_path} (rows={len(rsvps)})")

    x, y = build_dataset(impressions, rsvps, args.horizon_hours)
    if x.shape[0] == 0:
        print("No training data found.")
        return

    w, b = train_logistic_regression(x, y, args.lr, args.epochs)

    payload = {
        "feature_order": FEATURE_ORDER,
        "weights": w.tolist(),
        "bias": float(b),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "num_examples": int(x.shape[0]),
    }

    out_path = resolve_path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2))
    print(f"Saved model to {out_path}")


if __name__ == "__main__":
    main()
