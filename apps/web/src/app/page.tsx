"use client";

import { useEffect, useMemo, useState } from "react";

import { formatNumber, formatPercent } from "../lib/format";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type MetricsResult = {
  utilization: number;
  avg_fill_ratio: number;
  fairness_gap: number;
  top_overdemanded: { opp_id: string; fill: number; price: number }[];
  top_underfilled: { opp_id: string; fill: number; price: number }[];
  gini_exposure?: number | null;
  avg_diversity?: number | null;
};

type MetricsResponse = {
  metrics: MetricsResult;
  prices: Record<string, number>;
  demand_by_opp: Record<string, number>;
  shown_by_opp: Record<string, number>;
};

type Opportunity = {
  id: string;
  title: string;
  tags: string[];
  category: string;
  time_bucket: string;
  lat: number;
  lng: number;
  capacity: number;
  group_size: string;
  intensity: string;
  beginner_friendly: boolean;
};

type User = {
  id: string;
  interest_tags: string[];
  lat: number;
  lng: number;
  max_travel_mins: number;
  availability: string[];
  group_pref: string;
  intensity_pref: string;
  goal?: string | null;
  cohort?: string | null;
};

type StateSnapshot = {
  users: User[];
  opps: Opportunity[];
  prices: Record<string, number>;
  avg_fill: Record<string, number>;
  net_demand: Record<string, number>;
  shown_window: Record<string, number>;
  interactions: Array<{ user_id: string; opp_id: string; event: string; ts: string }>;
  last_assignment: [string, string][];
};

type SolveResponse = {
  assignments: Array<{ user_id: string; opp_id: string }>;
  unassigned_user_ids: string[];
  recommendations: Record<string, { primary?: string | null; alternatives: string[] }>;
  explanations: Record<string, { score: number; breakdown: Record<string, number>; reason_chips: string[] }>;
  prices: Record<string, number>;
  metrics: MetricsResult;
};

const fetchJson = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
};

export default function Page() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [solveResponse, setSolveResponse] = useState<SolveResponse | null>(null);
  const [status, setStatus] = useState<string>("Waiting for data...");
  const [numUsers, setNumUsers] = useState<number>(60);
  const [numOpps, setNumOpps] = useState<number>(24);

  const refreshMetrics = async () => {
    const data = await fetchJson<MetricsResponse>("/metrics");
    setMetrics(data);
  };

  const refreshSnapshot = async () => {
    const data = await fetchJson<StateSnapshot>("/state");
    setSnapshot(data);
  };

  const refreshAll = async () => {
    await Promise.all([refreshMetrics(), refreshSnapshot()]);
  };

  const withStatus = async (label: string, action: () => Promise<void>) => {
    setStatus(`${label}...`);
    try {
      await action();
      setStatus(`${label} done.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`${label} failed: ${message}`);
    }
  };

  const seedSynthetic = async () => {
    await fetchJson("/seed", {
      method: "POST",
      body: JSON.stringify({ mode: "synthetic", num_users: numUsers, num_opps: numOpps })
    });
    await refreshAll();
  };

  const solve = async () => {
    const data = await fetchJson<SolveResponse>("/solve", {
      method: "POST",
      body: JSON.stringify({})
    });
    setSolveResponse(data);
    await refreshAll();
  };

  const rebalance = async () => {
    const data = await fetchJson<SolveResponse>("/rebalance", {
      method: "POST",
      body: JSON.stringify({})
    });
    setSolveResponse(data);
    await refreshAll();
  };

  const simulateFeedback = async () => {
    if (!snapshot || snapshot.users.length === 0 || snapshot.opps.length === 0) {
      throw new Error("Seed data first");
    }
    const user = snapshot.users[Math.floor(Math.random() * snapshot.users.length)];
    const opp = snapshot.opps[Math.floor(Math.random() * snapshot.opps.length)];
    const events = ["accepted", "clicked", "declined"] as const;
    const event = events[Math.floor(Math.random() * events.length)];
    await fetchJson("/feedback", {
      method: "POST",
      body: JSON.stringify({ user_id: user.id, opp_id: opp.id, event })
    });
    await refreshAll();
  };

  useEffect(() => {
    withStatus("Loading", refreshAll);
  }, []);

  const opps = snapshot?.opps ?? [];
  const users = snapshot?.users ?? [];
  const assignments = solveResponse?.assignments ?? [];

  const oppCards = useMemo(() => {
    return opps.slice(0, 8).map((opp) => {
      const demand = metrics?.demand_by_opp?.[opp.id] ?? snapshot?.net_demand?.[opp.id] ?? 0;
      const shown = metrics?.shown_by_opp?.[opp.id] ?? snapshot?.shown_window?.[opp.id] ?? 0;
      const price = metrics?.prices?.[opp.id] ?? snapshot?.prices?.[opp.id] ?? 0;
      return {
        ...opp,
        demand,
        shown,
        price
      };
    });
  }, [opps, metrics, snapshot]);

  return (
    <main>
      <section className="hero">
        <div className="hero-card">
          <h1 className="hero-title">Flok Pulse Console</h1>
          <p className="hero-subtitle">
            Capacity-aware matchmaking for small-group communities. Seed data, run the solver,
            and watch pulse-based scarcity reshape allocations in real time.
          </p>
          <div className="status">API: {API_BASE}</div>
        </div>
        <div className="hero-card">
          <div className="panel-title">
            <h2>Hackathon Controls</h2>
          </div>
          <div className="form-row">
            <input
              className="input"
              type="number"
              min={10}
              max={200}
              value={numUsers}
              onChange={(event) => setNumUsers(Number(event.target.value))}
              aria-label="Number of users"
            />
            <input
              className="input"
              type="number"
              min={5}
              max={80}
              value={numOpps}
              onChange={(event) => setNumOpps(Number(event.target.value))}
              aria-label="Number of opportunities"
            />
          </div>
          <div className="controls" style={{ marginTop: "16px" }}>
            <button className="btn" onClick={() => withStatus("Seeding synthetic", seedSynthetic)}>
              Seed synthetic
            </button>
            <button className="btn" onClick={() => withStatus("Solving", solve)}>
              Run solve
            </button>
            <button className="btn secondary" onClick={() => withStatus("Rebalancing", rebalance)}>
              Rebalance
            </button>
            <button className="btn ghost" onClick={() => withStatus("Feedback", simulateFeedback)}>
              Simulate feedback
            </button>
            <button className="btn ghost" onClick={() => withStatus("Refreshing", refreshAll)}>
              Refresh
            </button>
          </div>
          <div className="status">{status}</div>
        </div>
      </section>

      <section className="stat-grid" style={{ marginBottom: "32px" }}>
        <div className="stat-card">
          <div className="stat-label">Utilization</div>
          <div className="stat-value">{formatPercent(metrics?.metrics.utilization)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Fill</div>
          <div className="stat-value">{formatPercent(metrics?.metrics.avg_fill_ratio)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Fairness Gap</div>
          <div className="stat-value">{formatNumber(metrics?.metrics.fairness_gap)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Gini Exposure</div>
          <div className="stat-value">{formatNumber(metrics?.metrics.gini_exposure)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Diversity</div>
          <div className="stat-value">{formatNumber(metrics?.metrics.avg_diversity)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Users / Opps</div>
          <div className="stat-value">
            {users.length} / {opps.length}
          </div>
        </div>
      </section>

      <section className="grid" style={{ marginBottom: "32px" }}>
        <div className="panel">
          <div className="panel-title">
            <h2>Top Pulse Signals</h2>
          </div>
          <div className="list">
            {(metrics?.metrics.top_overdemanded ?? []).map((item) => (
              <div key={`hot-${item.opp_id}`} className="list-item">
                <strong>{item.opp_id}</strong>
                <div className="status">Pulse {formatNumber(item.price)}</div>
              </div>
            ))}
            {(metrics?.metrics.top_overdemanded?.length ?? 0) === 0 && (
              <div className="status">No pulse data yet.</div>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">
            <h2>Needs Love</h2>
          </div>
          <div className="list">
            {(metrics?.metrics.top_underfilled ?? []).map((item) => (
              <div key={`cool-${item.opp_id}`} className="list-item">
                <strong>{item.opp_id}</strong>
                <div className="status">Pulse {formatNumber(item.price)}</div>
              </div>
            ))}
            {(metrics?.metrics.top_underfilled?.length ?? 0) === 0 && (
              <div className="status">No pulse data yet.</div>
            )}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "32px" }}>
        <div className="panel-title">
          <h2>Opportunities</h2>
          <span className="pill">Top 8 snapshot</span>
        </div>
        <div className="grid">
          {oppCards.map((opp) => (
            <div key={opp.id} className="stat-card">
              <div className="stat-label">{opp.category}</div>
              <h3>{opp.title}</h3>
              <div className="status">Capacity {opp.capacity}</div>
              <div className="status">Demand {formatNumber(opp.demand)}</div>
              <div className="status">Pulse {formatNumber(opp.price)}</div>
              <div className="status">Shown {opp.shown}</div>
              <div style={{ marginTop: "10px" }}>
                <span className="tag">{opp.group_size}</span>
                <span className="tag">{opp.intensity}</span>
                {opp.beginner_friendly && <span className="tag">Beginner</span>}
              </div>
            </div>
          ))}
          {oppCards.length === 0 && <div className="status">Seed data to see opportunities.</div>}
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panel-title">
            <h2>Assignments</h2>
          </div>
          <div className="list">
            {assignments.slice(0, 10).map((assignment, index) => (
              <div key={`${assignment.user_id}-${assignment.opp_id}-${index}`} className="list-item">
                <strong>{assignment.user_id}</strong> → {assignment.opp_id}
              </div>
            ))}
            {assignments.length === 0 && <div className="status">Run solve to see assignments.</div>}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">
            <h2>Recommendations</h2>
          </div>
          <div className="list">
            {solveResponse &&
              Object.entries(solveResponse.recommendations)
                .slice(0, 8)
                .map(([userId, rec]) => (
                  <div key={userId} className="list-item">
                    <strong>{userId}</strong>
                    <div className="status">Primary: {rec.primary ?? "—"}</div>
                    <div className="status">Alt: {rec.alternatives.join(", ") || "—"}</div>
                  </div>
                ))}
            {!solveResponse && <div className="status">Run solve to see recommendations.</div>}
          </div>
        </div>
      </section>
    </main>
  );
}
