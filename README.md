# Flok — Capacity-Aware Community Matching

Community apps are great at listing events, but they struggle with a real-world constraint: **social opportunities are scarce.**  
Small groups have limited seats, popular activities get oversubscribed, and newcomers or quieter users can get crowded out. Meanwhile, other good opportunities remain underfilled.

**Flok** solves this with a *capacity-aware matching engine* that:
- learns real demand from user actions (RSVPs),
- converts demand into a smooth “pulse” signal,
- and uses that signal to allocate limited seats fairly while still maximizing personal fit.

---

## Problem

### What goes wrong in typical community/event feeds
Typical community/event feeds often falter due to the following problems:

1. **Oversubscription**: the same “top” events get pushed to everyone → they fill up fast → users hit “Full”.
2. **Popularity lock-in**: early winners stay winners; new or niche activities never get discovered.
3. **Unfair access**: the most active / fastest users grab spots first; first-timers lose out.
4. **Poor utilization**: organizers struggle to fill less visible events even when they’re a good fit for some users.

A standard recommender optimizes: “show each user what they might like most.”  
But it usually doesn’t optimize: **“match people to limited seats while keeping the system balanced.”**

---

## Solution (what we built)

We treat each opportunity (event/activity) as having:
- **Supply**: its capacity (available seats)
- **Demand**: how much the community is trying to join it

We maintain a continuously updated **net demand signal** and convert it into a bounded, stable **Pulse Score (0–100)**.  
Then we use this pulse as a **scarcity correction** inside a constrained matching solver:

- Over-demanded events become “harder to get” for marginal matches
- Under-demanded events get a gentle boost
- The solver still maximizes *personal fit*, but now respects *capacity* and *system health*

This produces better outcomes:
- fewer “full” dead-ends,
- better fill rates,
- and fairer access to small-group opportunities.

---

## How it works (briefly)

1) **Users interact** with opportunities (shown / clicked / RSVP / declined).  
2) The system maintains a **net demand** signal per opportunity (event) that **decays over time**.  
3) Net demand is converted into a bounded **Pulse Score (0–100)**.  
4) Pulse acts like a **scarcity correction** during matching:
   - hot (overdemanded) opportunities become harder to match into,
   - cold (underdemanded) opportunities get a small boost.
5) A capacity-constrained solver (OR-Tools min-cost flow) produces assignments.

---

<details>
<summary><strong>Math & Engine Details (expand)</strong></summary>

### 1) Users generate demand (feedback)
When users interact with an opportunity (`/feedback`), we update a per-opportunity demand state `D`:

- `accepted/RSVP` → `D += 1.0`
- `clicked` → `D += 0.2` *(optional / low weight)*
- `declined` → `D -= 0.5` *(optional)*
- `shown` → no change

### 2) Demand decays over time (trends fade naturally)
Before applying each new update, we decay old demand so that yesterday’s hype doesn’t dominate:

${D \leftarrow D \cdot e^{-\Delta t / \tau}}$

- `Δt` = time since last update
- `τ` (tau) = decay timescale (default: **12 hours**)

This makes demand a **smooth, recency-weighted** signal.

### 3) Convert demand into a bounded Pulse Score (0–100)
Each opportunity has a stability/liquidity scale:

${L = k \cdot \text{capacity}}$

- `k` is a tuning constant (default: **5**)
- Higher capacity → harder to move → more stable

Then pulse is computed via a sigmoid:

${
\text{pulse} = 100 \cdot \sigma\left(\frac{D}{L}\right),
\quad
\sigma(x)=\frac{1}{1+e^{-x}}
}$

The pulse value is a proxy for demand:
- `pulse ≈ 50` means neutral demand (`D ≈ 0`)
- `pulse > 50` means increasing demand pressure
- `pulse < 50` means weak demand / underfilled

The sigmoid keeps pulse **bounded** and gives diminishing returns (hard to “pump” to 100 quickly).

### 4) Pulse adjusts matching scores (scarcity correction)
We compute a base fit score `S(user, opp)` from user preferences (interests, distance, schedule, etc.).

Then we apply a pulse-based adjustment:

${
\text{pulse} = \text{pulse} - 50}$

${S_{\text{adj}} = S - \lambda \cdot \text{pulse}
}$

- High pulse (over-demanded) → positive centered value → **penalty**
- Low pulse (under-demanded) → negative centered value → **subsidy**
- `λ` controls how strongly scarcity affects matching

### 5) Solving a capacity-constrained allocation problem 
We then compute assignments using a constrained optimizer (OR-Tools min-cost flow):

Constraints:
- each user gets **at most one** assignment
- each opportunity has a **capacity**
- users may remain unassigned if nothing is a good fit

Objective:
- maximize total adjusted score \(\sum S_{\text{adj}}\)

This is the key difference from a typical feed: we don’t just *rank* items, we **allocate scarce seats** so the system doesn’t collapse into oversubscription.

</details>

---
## What's in it for our users
- A personalized list of opportunities that they can realistically join
- Over-demanded opportunities may appear less often unless the user is a very strong match
- Underfilled but relevant opportunities get surfaced more
- (Optional) “High demand” / “Limited spots” labels powered by pulse

---

## Metrics we care about (social impact aligned)
- **Time-to-first-RSVP** (help users connect faster)
- **% users matched within 24h**
- **Fill rate** across opportunities (less waste)
- **Oversubscription rate** (“full” frustration)
- **Inclusion metrics** (optional policy layer: first-timers/newcomers not crowded out)

---

## System overview (high level)
- **API**
  - `POST /feedback` — record interactions, update `D`
  - `POST /rebalance` — recompute pulse + re-run matching (can be periodic)
- **State**
  - per opportunity: `D`, `pulse`, `L`, `capacity`, optional history
- **Optimizer**
  - computes assignments with OR-Tools (capacity constraints)

---

## Running locally (example)
> Update this section with your actual commands/paths.

```bash
# install dependencies
pip install -r requirements.txt

# run API
uvicorn app.main:app --reload

# (optional) trigger a rebalance
curl -X POST http://localhost:8000/rebalance