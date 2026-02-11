# Math + ML (Logistic Regression + Pulse)

Flok’s premise is that the limiting resource in local communities is not attention—it’s *seats*. If a feed only optimizes “what gets engagement,” it amplifies early winners, users repeatedly hit “Full,” and good long-tail opportunities stay underfilled.

This project makes capacity explicit by combining:

- **Fit (personal):** “How likely is this user to RSVP this event?”
- **Pulse (global):** “How overdemanded is this event right now (relative to its capacity)?”

---

## 1) Fit: logistic regression for `S_ml`

We model RSVP as a probability:

$$
S_{ml} = P(\text{RSVP}=1 \mid \text{user}, \text{event})
$$

In the backend, this is implemented as a lightweight logistic model:

$$
S_{ml}=\sigma(b + w^\top x),\quad \sigma(z)=\frac{1}{1+e^{-z}}
$$

Where `x` is a small feature vector computed per user-event pair.

### Features used (in this repo)
The feature names used by the model are:
- `interest` — Jaccard similarity between user tags and event tags.
- `goal_match` — whether event hints match the user’s stated goal.
- `group_match` — preference alignment between user and event group size.
- `travel_penalty` — normalized travel time (0..1) capped at 1.
- `intensity_mismatch` — mismatch between user and event intensity (0..1).
- `novelty_bonus` — boosts “fresh” options the user hasn’t seen.
- `pulse_centered` — `(pulse - 50)` (global demand pressure as a centered feature).
- `availability_ok` — whether the event’s time bucket matches the user’s availability.

Code pointers:
- Model + weights: `apps/api/app/ml/rsvp_model.py`
- Feature computation: `apps/api/app/domain/features.py`
- Scoring pipeline: `apps/api/app/optimizer/solver.py`

### How it ties to the problem
The fit model ensures Flok doesn’t “route people away from popular events” blindly. It preserves personalization: high-fit users still tend to see high-fit events near the top, even as demand rises.

### Training data (logging)
This repo logs impressions and RSVP outcomes to JSONL files (for offline training outside this codebase):
- Impressions: `RSVP_IMPRESSIONS_LOG_PATH` (default: `apps/api/data/impressions.jsonl`)
- RSVPs: `RSVP_EVENTS_LOG_PATH` (default: `apps/api/data/rsvps.jsonl`)

The backend loads weights from `RSVP_MODEL_PATH` (default: `apps/api/data/rsvp_model.json`) and falls back to a neutral model if the file is missing.

---

## 2) Pulse: bounded demand pressure for `pulse`

Pulse is a bounded 0–100 signal designed to represent *demand pressure relative to capacity*.

### 2.1 Net demand update with decay
Each interaction updates a per-event net-demand state `D`:

1) First apply exponential decay:

$$
D \leftarrow D \cdot e^{-\Delta t / \tau}
$$

2) Then add a small delta based on the interaction type (as implemented here):
- `accepted` → `+1.0`
- `clicked` → `+0.2`
- `declined` → `-0.5`

The decay time constant is `τ = DEMAND_DECAY_TAU_HOURS` (default: 12 hours).

Code pointers:
- Demand updates + decay: `apps/api/app/services/state_store.py`

### 2.2 Convert demand → pulse (0..100)
We scale demand by a capacity-based liquidity term:

$$
L = k \cdot \max(1, \text{capacity})
$$

Then compute:

$$
\text{pulse} = 100 \cdot \sigma\left(\frac{D}{L}\right)
$$

Where `k = PRICING_LIQUIDITY_K` (default: 5.0).

Code pointers:
- Pulse computation: `apps/api/app/optimizer/pricing.py`

### How it ties to the problem
Pulse is the mechanism that detects “this event is getting overdemanded *for its size*.” A 30-person event should not be penalized the same way as a 6-person event.

---

## 3) Putting it together: capacity-aware ranking

The final adjusted score used for ranking is:

$$
S_{adj} = S_{ml} - \lambda \cdot (\text{pulse} - 50)
$$

In code:
- `pulse_centered = pulse - 50`
- `price_adjustment = -lambda_price * pulse_centered`
- `score_adj = s_ml + price_adjustment`

Where `λ = PRICING_LAMBDA` (default: 1.0). (Demo Lab can override this to make shifts easier to see.)

Code pointers:
- Combination of signals + explanations: `apps/api/app/optimizer/solver.py`
- Demo Lab spike + overrides: `apps/api/app/api/routes_demo.py`

### Why this works (intuition)
- When an event is **underdemanded** (`pulse < 50`), it gets a small boost.
- When an event is **overdemanded** (`pulse > 50`), it gets a penalty.
- **High-fit users** still keep hot events high because their `S_ml` dominates the penalty.
- **Marginal users** get routed to great alternatives sooner, reducing “Full” dead-ends and improving overall fill.

---

## How this addresses the original failure mode

Capacity-aware ranking is how Flok turns “interest” into “successful meetups”:
- Fewer repeated “Full” outcomes → less user frustration and churn.
- Better utilization of the long tail → more events reach viable participation.
- More inclusive access → outcomes aren’t dominated by “fastest finger wins.”

