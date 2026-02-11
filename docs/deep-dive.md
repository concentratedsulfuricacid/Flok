# Flok — Deep Dive

This is the longer-form reference for how Flok works (math + endpoints + where to look in the code). For the short, story-driven overview, see the repo root `README.md`.

## Motivation (the “why”)
Most social/event apps implicitly optimize for attention: show what gets clicks, amplify what’s trending, and assume engagement can always convert into participation.

But real-world meetups are capacity-constrained:
- A great dinner, hike, study group, or volunteer shift might have 6–12 seats.
- Popularity concentrates early attention, so the feed keeps showing the same few events.
- Users hit repeated “Full” dead-ends and churn.
- Meanwhile, genuinely good opportunities go underfilled, so communities waste capacity and people don’t connect.

Flok’s north star is successful participation: help people find events they’ll like *and can actually join*, reduce “Full” failures by routing marginal demand to great alternatives, and increase discovery for new/community-created events so more things fill.

---

## What Flok Does

### User experience
- Shows a feed of **all events** (user generated + institutional).
- Clearly labels events that are not feasible right now (e.g., *not in your availability*, *too far*, *full*).
- Ranks feasible events by a **capacity-aware score** so users see what they can realistically join.
- Surfaces a global **Trending** view powered by Pulse.

### Why this matters
Traditional social feeds often over-surface popular items, which:
- wastes user time (tap → full → churn),
- creates popularity lock-in (same winners),
- reduces utilization of the long tail.

Flok addresses this by explicitly modeling **demand pressure** and using it as a scarcity correction.

---

## Core Feature

Flok uses two signals:

1) **Fit (personal):** “How likely are *you* to RSVP this?”
- Estimated by a lightweight logistic model (see `apps/api/app/ml/rsvp_model.py`).
- Output: `S_ml` in `[0, 1]`.
- The backend loads weights from `RSVP_MODEL_PATH` (default: `data/rsvp_model.json`) and falls back to a neutral model if missing.

2) **Pulse (global):** “How hot is this event right now?”
- Derived from recent RSVPs/clicks with decay.
- Output: `pulse` in `[0, 100]`.

Then we combine them:

```
S_adj = S_ml - λ * (pulse - 50)
```

- If an event becomes **overdemanded** (pulse ↑), it gets a penalty.
- If it’s **underdemanded** (pulse ↓), it gets a subsidy.
- High-fit users still keep hot events high; marginal users get routed to strong alternatives.

---

## How It Works

### 1) Feedback updates net demand `D`
User interactions (`shown`, `clicked`, `accepted/RSVP`, `declined`) update a per-event **net demand** value `D`.

Before applying a new delta, demand decays over time:

${D \leftarrow D \cdot e^{-\Delta t / \tau}}$

Where:
- `Δt` = time since last update
- `τ` = decay timescale (default: 12 hours; `DEMAND_DECAY_TAU_HOURS`)

### 2) Convert demand → Pulse (0–100)
We set a stability/liquidity scale:

${L = k \cdot \text{capacity}}$

Then compute pulse:

${
\text{pulse} = 100 \cdot \sigma\left(\frac{D}{L}\right),
\quad
\sigma(x)=\frac{1}{1+e^{-x}}
}$

Interpretation:
- `pulse ≈ 50` → neutral
- `pulse > 50` → rising demand pressure
- `pulse < 50` → weak demand / underfilled

### 3) Rank feasible events using `S_adj`
We compute `S_ml = P(RSVP | user,event)` and apply scarcity:

```
S_adj = S_ml - λ*(pulse - 50)
```

Events are then sorted:
1) **Eligible events** (feasible for the user) sorted by `S_adj` descending
2) **Ineligible events** appended after, sorted by start time soonest

---

## Demo Lab

The WinUi includes a Demo Lab that makes the algorithm visible.

### What Demo Lab does
1) **Setup demo scenario** (`POST /demo/setup`)
   - Creates a deterministic dataset:
     - one “hot” event eligible for both demo users
     - a **high-fit** user and a **mid-fit** user
   - Ensures the hot event has:
     - High user: high `S_ml`
     - Mid user: medium `S_ml`

2) **Spike demand** (`POST /demo/simulate`)
   - The UI calls this with `{"level": 1|2|3, "hot_event_id": "..."}`.
   - Higher levels push the event to higher pulse / higher fill.
   - Feeds update after each spike so you can see ranking shift.

### Expected behavior
- Pulse increases globally for the “hot” event.
- High-fit user keeps the hot event near the top.
- Mid-fit user sees the hot event pushed down as it becomes overdemanded.

---

## API Endpoints

> WinUi uses Vite dev-server proxies for `/api`, `/seed`, `/demo`, `/metrics`, and `/trending` (see `WinUi/vite.config.ts`).

### Data + feed
- `POST /seed`
  Seed/generate synthetic users + opportunities.
- `GET /api/events/recommended?user_id=...`
  Returns **all events**, ranked/annotated as described below.

### RSVP + feedback
- `POST /api/events/{event_id}/rsvp`
- `DELETE /api/events/{event_id}/rsvp`
- `POST /feedback`
  Record `shown|clicked|accepted|declined` and update `D` (with decay).

### Pulse + monitoring
- `GET /trending?limit=...`
- `GET /metrics`

### Demo
- `POST /demo/setup`
- `POST /demo/simulate`

---

## Eligibility, Reasons, and Sorting

Flok returns *all* events but makes feasibility explicit:

### Event fields
- `eligible: true|false`
- If `eligible=false`:
  - `blocked_reasons`: machine codes (`NOT_IN_AVAILABILITY`, `TOO_FAR`, `FULL`)
  - `blocked_reason_text`: human chips (“Not in your availability”, “Too far (12km)”)

Only `eligible=true` events include:
- `fitScore` (`S_ml`)
- `s_adj` (`S_adj`)
- `reasons[]` (explainability chips)

### Sorting rules
1) Eligible events sorted by `s_adj` descending
2) Ineligible events appended after, sorted by soonest start time

---

## Project Structure

Backend (FastAPI):
- `apps/api/app/api/routes_demo.py` — demo setup + simulation
- `apps/api/app/api/routes_frontend.py` — frontend-shaped feed + RSVP endpoints
- `apps/api/app/services/state_store.py` — in-memory store for users/opps, net demand, pulses, RSVPs
- `apps/api/app/optimizer/solver.py` — scoring + (optional) assignment
- `apps/api/app/domain/models.py` — response models

Frontend (WinUi):
- `WinUi/src/pages/EventsPage.tsx` — Demo Lab UI + recommended feed

---

## Run Locally

### Backend
```bash
cd apps/api
python3 -m venv .venv && source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd WinUi
npm install
npm run dev
```

---

## Tuning Knobs

- `DEMAND_DECAY_TAU_HOURS` (`τ`): how fast trends fade (e.g., 6h–24h)
- `PRICING_LIQUIDITY_K` (`k`): how stable pulse is relative to capacity
- `PRICING_LAMBDA` (`λ`): how strongly pulse penalizes hot events
