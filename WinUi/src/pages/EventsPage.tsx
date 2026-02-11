import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { loadDemoUserProfile } from "../demo/demoUserStore";
import type { DemoUserProfile } from "../demo/demoUserStore";

export type Event = {
  description: string;
  creator: string;
  dateTime: string; // ISO for now
  participants: string[];
  capacity: number;
  isFull: boolean;
  location: string;
  tags: string[];
  fitScore?: number;
  pulse?: number;
  reasons?: string[];
};

type FeedItem = {
  event_id: string;
  title: string;
  category: string;
  fit_score: number;
  pulse: number;
  reasons: string[];
};

type FeedResponse = {
  user_id: string;
  items: FeedItem[];
};

type MetricsResponse = {
  metrics: {
    utilization: number;
    avg_fill_ratio: number;
    fairness_gap: number;
  };
};

type TrendingItem = {
  event_id: string;
  title: string;
  pulse: number;
  pulse_delta: number;
};

type DemoResponse = {
  movers?: TrendingItem[];
};

/**
 * TODO (backend): implement GET /api/events/recommended => Event[]
 * Backend returns the list already ordered (recommended ranking).
 */
export async function getAllEvents(userId?: string): Promise<Event[]> {
  const url = userId ? `/api/events?user_id=${encodeURIComponent(userId)}` : "/api/events";
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
  return (await res.json()) as Event[];
}

async function getFeed(userId: string, limit = 10): Promise<FeedResponse> {
  const res = await fetch(`/feed?user_id=${encodeURIComponent(userId)}&limit=${limit}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to fetch feed: ${res.status}`);
  return (await res.json()) as FeedResponse;
}

async function getMetrics(): Promise<MetricsResponse> {
  const res = await fetch("/metrics", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to fetch metrics: ${res.status}`);
  return (await res.json()) as MetricsResponse;
}

async function getTrending(limit = 5): Promise<TrendingItem[]> {
  const res = await fetch(`/trending?limit=${limit}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to fetch trending: ${res.status}`);
  const data = (await res.json()) as { items?: TrendingItem[] };
  return data.items ?? [];
}

function EventCard({ event }: { event: Event }) {
  const dt = useMemo(() => new Date(event.dateTime), [event.dateTime]);

  return (
    <div className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-neutral-500">Event</div>
          <div className="mt-1 text-base font-semibold text-neutral-900">
            {event.description}
          </div>
          <div className="mt-1 text-sm text-neutral-600">
            By <span className="font-medium">{event.creator}</span>
          </div>
        </div>

        <span
          className={
            "shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 " +
            (event.isFull
              ? "bg-neutral-100 text-neutral-700 ring-neutral-200"
              : "bg-rose-50 text-rose-700 ring-rose-200")
          }
        >
          {event.isFull ? "Full" : "Open"}
        </span>
      </div>

      <div className="mt-3 grid gap-1 text-sm text-neutral-600">
        <div>
          <span className="font-medium">When:</span> {dt.toLocaleString()}
        </div>
        <div>
          <span className="font-medium">Where:</span> {event.location}
        </div>
        <div>
          <span className="font-medium">Slots:</span> {event.participants.length}/{event.capacity}
        </div>
      </div>

      {event.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {event.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {(typeof event.fitScore === "number" || typeof event.pulse === "number" || event.reasons?.length) && (
        <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
          <div className="flex flex-wrap gap-3">
            {typeof event.fitScore === "number" && (
              <div>
                <span className="font-semibold text-neutral-800">Fit</span>:{" "}
                {event.fitScore.toFixed(3)}
              </div>
            )}
            {typeof event.pulse === "number" && (
              <div>
                <span className="font-semibold text-neutral-800">Pulse</span>:{" "}
                {event.pulse.toFixed(1)}
              </div>
            )}
          </div>
          {event.reasons && event.reasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {event.reasons.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200"
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoUser, setDemoUser] = useState<DemoUserProfile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [feedPreview, setFeedPreview] = useState<FeedItem[]>([]);
  const [metrics, setMetrics] = useState<MetricsResponse["metrics"] | null>(null);
  const [movers, setMovers] = useState<TrendingItem[]>([]);
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      if (a.isFull !== b.isFull) {
        return a.isFull ? 1 : -1;
      }
      const aTime = new Date(a.dateTime).getTime();
      const bTime = new Date(b.dateTime).getTime();
      return aTime - bTime;
    });
  }, [events]);

  useEffect(() => {
    (async () => {
      const p = await loadDemoUserProfile();
      setDemoUser(p);
    })();
  }, []);

  const ensureUserId = async (forceNew = false) => {
    if (!forceNew) {
      const existing = localStorage.getItem("flok.apiUserId");
      if (existing) {
        setUserId(existing);
        return existing;
      }
    }

    let profile = demoUser;
    if (!profile) {
      profile = await loadDemoUserProfile();
      setDemoUser(profile);
    }

    if (!profile) return null;

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        interests: profile.interests,
        location: profile.location,
        availability: ["weeknights", "weekends"],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user_id?: string };
    if (data.user_id) {
      localStorage.setItem("flok.apiUserId", data.user_id);
      setUserId(data.user_id);
      return data.user_id;
    }
    return null;
  };

  useEffect(() => {
    void ensureUserId();
  }, [demoUser]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const uid = (await ensureUserId()) ?? undefined;
      const list = await getAllEvents(uid);
      setEvents(list);
    } catch (e) {
      setEvents([]);
      setError(e instanceof Error ? e.message : "Failed to load events.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const refreshDemoData = async (uid: string) => {
    const [feedRes, metricsRes, trendingRes] = await Promise.allSettled([
      getFeed(uid, 6),
      getMetrics(),
      getTrending(5),
    ]);

    if (feedRes.status === "fulfilled") {
      setFeedPreview(feedRes.value.items);
    }
    if (metricsRes.status === "fulfilled") {
      setMetrics(metricsRes.value.metrics);
    }
    if (trendingRes.status === "fulfilled") {
      const trendingItems = trendingRes.value;
      setMovers((prev) => {
        if (trendingItems.length === 0) return prev;
        const hasMovement = trendingItems.some((item) => Math.abs(item.pulse_delta) > 1e-6);
        if (!hasMovement && prev.length > 0) return prev;
        return trendingItems;
      });
    }
  };

  const simulateDemandSpike = async () => {
    setDemoBusy(true);
    setDemoError(null);
    try {
      const uid = await ensureUserId();
      if (!uid) throw new Error("Missing demo user.");
      const res = await fetch("/demo/simulate?scenario=oversubscribe_one_event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Demo simulate failed: ${res.status}`);
      const data = (await res.json()) as DemoResponse;
      if (data.movers && data.movers.length > 0) {
        setMovers(data.movers);
      }
      await refreshDemoData(uid);
      await load();
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : "Demo simulation failed.");
    } finally {
      setDemoBusy(false);
    }
  };

  const resetDemo = async () => {
    setDemoBusy(true);
    setDemoError(null);
    try {
      const res = await fetch("/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "synthetic", num_users: 20, num_opps: 50 }),
      });
      if (!res.ok) throw new Error(`Seed failed: ${res.status}`);
      localStorage.removeItem("flok.apiUserId");
      setUserId(null);
      const uid = await ensureUserId(true);
      if (uid) {
        await refreshDemoData(uid);
      }
      await load();
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : "Failed to reset demo.");
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Events</h1>
          <p className="mt-2 text-neutral-600">
            All events (we’ll add filters and join actions later).
          </p>
        </div>

        <button
          onClick={load}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
          disabled={loading}
        >
          <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-neutral-900">Demo Mode</div>
            <div className="text-xs text-neutral-500">Toggle to run market simulations.</div>
          </div>
          <button
            onClick={() => setDemoMode((prev) => !prev)}
            className={
              "rounded-full px-4 py-1 text-xs font-semibold ring-1 " +
              (demoMode ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-neutral-100 text-neutral-600 ring-neutral-200")
            }
          >
            {demoMode ? "ON" : "OFF"}
          </button>
        </div>
        {demoMode && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={simulateDemandSpike}
                disabled={demoBusy}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
              >
                Simulate demand spike
              </button>
              <button
                onClick={resetDemo}
                disabled={demoBusy}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-60"
              >
                Reset / Reseed
              </button>
            </div>
            {demoError && <div className="text-xs font-semibold text-rose-700">{demoError}</div>}
            {(metrics || movers.length > 0 || feedPreview.length > 0) && (
              <div className="grid gap-3 text-xs text-neutral-600 sm:grid-cols-3">
                <div className="rounded-xl bg-neutral-50 p-3">
                  <div className="font-semibold text-neutral-800">Metrics</div>
                  {metrics ? (
                    <div className="mt-2 space-y-1">
                      <div>Utilization: {(metrics.utilization * 100).toFixed(1)}%</div>
                      <div>Avg fill: {(metrics.avg_fill_ratio * 100).toFixed(1)}%</div>
                      <div>Fairness gap: {metrics.fairness_gap.toFixed(3)}</div>
                    </div>
                  ) : (
                    <div className="mt-2 text-neutral-500">No metrics yet.</div>
                  )}
                </div>
                <div className="rounded-xl bg-neutral-50 p-3">
                  <div className="font-semibold text-neutral-800">Top movers</div>
                  {movers.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {movers.slice(0, 3).map((m) => (
                        <div key={m.event_id}>
                          {m.title} <span className="text-rose-700">({m.pulse_delta >= 0 ? "+" : ""}{m.pulse_delta.toFixed(1)})</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-neutral-500">No movers yet.</div>
                  )}
                </div>
                <div className="rounded-xl bg-neutral-50 p-3">
                  <div className="font-semibold text-neutral-800">Feed preview</div>
                  {feedPreview.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {feedPreview.slice(0, 3).map((item) => (
                        <div key={item.event_id}>
                          {item.title} <span className="text-neutral-500">({item.fit_score.toFixed(2)})</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-neutral-500">No feed yet.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="text-neutral-600">Loading events…</div>
        ) : error ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-rose-700">Couldn’t load events</div>
            <div className="text-sm text-neutral-600">
              {error}
              <div className="mt-2 text-neutral-500">
                Expected endpoint: <span className="font-mono">GET /api/events</span>
              </div>
            </div>
          </div>
        ) : events.length === 0 ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-neutral-800">No recommended events</div>
            <div className="text-sm text-neutral-600">
              When the API is ready, events will appear here in backend order.
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedEvents.map((e, idx) => (
              <EventCard key={`${e.creator}-${e.dateTime}-${idx}`} event={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
