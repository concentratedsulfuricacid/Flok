import React, { useEffect, useMemo, useState } from "react";
import {
  Bell,
  RefreshCw,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  Compass,
} from "lucide-react";
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

type FeedTab = "all" | "near";

const NEARBY_RADIUS_KM = 5;

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

const initialsFor = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const formatRelativeTime = (value: Date) => {
  const deltaMs = value.getTime() - Date.now();
  const deltaMins = Math.round(Math.abs(deltaMs) / 60000);

  if (deltaMins < 1) return "just now";
  if (deltaMins < 60) return deltaMs < 0 ? `${deltaMins}m ago` : `in ${deltaMins}m`;

  const deltaHrs = Math.round(deltaMins / 60);
  if (deltaHrs < 24) return deltaMs < 0 ? `${deltaHrs}h ago` : `in ${deltaHrs}h`;

  const deltaDays = Math.round(deltaHrs / 24);
  return deltaMs < 0 ? `${deltaDays}d ago` : `in ${deltaDays}d`;
};

const parseLocation = (value?: string | null) => {
  if (!value || !value.includes(",")) return null;
  const [latRaw, lngRaw] = value.split(",", 2);
  const lat = Number(latRaw.trim());
  const lng = Number(lngRaw.trim());
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
};

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
};

function EventCard({ event, index }: { event: Event; index: number }) {
  const dt = useMemo(() => new Date(event.dateTime), [event.dateTime]);
  const spotsLeft = Math.max(event.capacity - event.participants.length, 0);
  const fillRatio = event.capacity ? event.participants.length / event.capacity : 0;
  const status = event.isFull ? "Offer" : "Need";
  const statusTone = event.isFull
    ? "bg-[var(--color-chip)] text-[var(--color-accent)]"
    : "bg-[var(--color-accent)] text-white";

  return (
    <article
      className="group relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-4 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.6)] backdrop-blur motion-safe:animate-[fade-up_0.7s_ease-out]"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="absolute -right-6 top-8 h-20 w-20 rounded-full bg-[radial-gradient(circle,rgba(47,143,131,0.35),transparent_70%)] opacity-0 transition duration-500 group-hover:opacity-100" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-emerald-200 via-white to-amber-200 text-sm font-semibold text-emerald-900">
            {initialsFor(event.creator)}
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--color-ink)]">{event.creator}</div>
            <div className="text-xs text-[var(--color-muted)]">
              {formatRelativeTime(dt)} · {event.location}
            </div>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${statusTone}`}>
          {status}
        </span>
      </div>

      <div className="mt-3">
        <div className="text-base font-semibold text-[var(--color-ink)]">
          {event.description}
        </div>
        <div className="mt-2 text-sm text-[var(--color-muted)]">
          {event.isFull
            ? "This gathering is currently full."
            : `Looking for ${spotsLeft} more participant${spotsLeft === 1 ? "" : "s"}.`}
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--color-mist)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-amber-400"
          style={{ width: `${Math.min(fillRatio * 100, 100)}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>
          {event.participants.length}/{event.capacity} spots filled
        </span>
        <span>{dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
      </div>

      {event.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {event.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[var(--color-chip)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-accent)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {(typeof event.fitScore === "number" || typeof event.pulse === "number" || event.reasons?.length) && (
        <div className="mt-4 rounded-2xl bg-[var(--color-mist)]/70 p-3 text-xs text-[var(--color-muted)]">
          <div className="flex flex-wrap gap-3">
            {typeof event.fitScore === "number" && (
              <div className="font-semibold text-[var(--color-ink)]">Fit {event.fitScore.toFixed(3)}</div>
            )}
            {typeof event.pulse === "number" && (
              <div className="font-semibold text-[var(--color-ink)]">Pulse {event.pulse.toFixed(1)}</div>
            )}
          </div>
          {event.reasons && event.reasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {event.reasons.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]"
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function DemoPanel({
  demoMode,
  onToggle,
  demoBusy,
  demoError,
  onSimulate,
  onReset,
  metrics,
  movers,
  feedPreview,
}: {
  demoMode: boolean;
  onToggle: () => void;
  demoBusy: boolean;
  demoError: string | null;
  onSimulate: () => void;
  onReset: () => void;
  metrics: MetricsResponse["metrics"] | null;
  movers: TrendingItem[];
  feedPreview: FeedItem[];
}) {
  return (
    <section className="rounded-[28px] border border-white/70 bg-white/75 p-4 shadow-[0_16px_40px_-26px_rgba(15,23,42,0.55)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
            <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
            Demo Lab
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Toggle simulations, refresh data, and watch live metrics.
          </p>
        </div>
        <button
          onClick={onToggle}
          className={
            "rounded-full px-4 py-1 text-[11px] font-semibold transition " +
            (demoMode
              ? "bg-[var(--color-accent)] text-white"
              : "bg-[var(--color-mist)] text-[var(--color-muted)]")
          }
        >
          {demoMode ? "ON" : "OFF"}
        </button>
      </div>

      {demoMode && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onSimulate}
              disabled={demoBusy}
              className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
            >
              Simulate demand spike
            </button>
            <button
              onClick={onReset}
              disabled={demoBusy}
              className="rounded-full border border-[var(--color-mist)] bg-white px-4 py-2 text-xs font-semibold text-[var(--color-muted)] transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
            >
              Reset / Reseed
            </button>
          </div>
          {demoError && <div className="text-xs font-semibold text-rose-600">{demoError}</div>}

          {(metrics || movers.length > 0 || feedPreview.length > 0) && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-[var(--color-mist)]/80 p-3 text-xs text-[var(--color-muted)]">
                <div className="font-semibold text-[var(--color-ink)]">Metrics</div>
                {metrics ? (
                  <div className="mt-2 space-y-1">
                    <div>Utilization: {(metrics.utilization * 100).toFixed(1)}%</div>
                    <div>Avg fill: {(metrics.avg_fill_ratio * 100).toFixed(1)}%</div>
                    <div>Fairness gap: {metrics.fairness_gap.toFixed(3)}</div>
                  </div>
                ) : (
                  <div className="mt-2 text-[var(--color-muted)]">No metrics yet.</div>
                )}
              </div>

              <div className="rounded-2xl bg-[var(--color-mist)]/80 p-3 text-xs text-[var(--color-muted)]">
                <div className="flex items-center gap-2 font-semibold text-[var(--color-ink)]">
                  <TrendingUp className="h-4 w-4 text-[var(--color-accent)]" />
                  Top movers
                </div>
                {movers.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {movers.slice(0, 3).map((m) => (
                      <div key={m.event_id} className="flex items-center justify-between">
                        <span>{m.title}</span>
                        <span className="text-[var(--color-accent)]">
                          {m.pulse_delta >= 0 ? "+" : ""}{m.pulse_delta.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-[var(--color-muted)]">No movers yet.</div>
                )}
              </div>

              <div className="rounded-2xl bg-[var(--color-mist)]/80 p-3 text-xs text-[var(--color-muted)]">
                <div className="font-semibold text-[var(--color-ink)]">Feed preview</div>
                {feedPreview.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {feedPreview.slice(0, 3).map((item) => (
                      <div key={item.event_id} className="flex items-center justify-between">
                        <span>{item.title}</span>
                        <span className="text-[var(--color-muted)]">{item.fit_score.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-[var(--color-muted)]">No feed yet.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
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
  const [activeTab, setActiveTab] = useState<FeedTab>("all");
  const userCoords = useMemo(() => parseLocation(demoUser?.location), [demoUser?.location]);

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

  const filteredEvents = useMemo(() => {
    if (activeTab === "all") return sortedEvents;
    if (!userCoords) return sortedEvents;
    return sortedEvents.filter((event) => {
      const coords = parseLocation(event.location);
      if (!coords) return false;
      return haversineKm(userCoords, coords) <= NEARBY_RADIUS_KM;
    });
  }, [activeTab, sortedEvents, userCoords]);

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

  const greetingName = demoUser?.name ?? "there";

  return (
    <div className="relative space-y-6">
      <div className="pointer-events-none absolute -top-20 left-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(47,143,131,0.28),transparent_70%)] blur-2xl" />
      <div className="pointer-events-none absolute right-0 top-24 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(248,199,125,0.35),transparent_70%)] blur-2xl" />

      <section className="relative rounded-[32px] border border-white/70 bg-white/75 p-5 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.6)] backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-emerald-300 via-white to-amber-300 text-base font-bold text-emerald-900">
              {initialsFor(greetingName)}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">
                Good morning,
              </p>
              <h1 className="text-2xl font-semibold text-[var(--color-ink)] [font-family:var(--font-display)]">
                {greetingName}
              </h1>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {demoUser?.location ? `${demoUser.location} community feed` : "Your community feed"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 text-[var(--color-ink)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              aria-label="Refresh"
            >
              <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
            </button>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 text-[var(--color-ink)] shadow-sm"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 rounded-full bg-[var(--color-mist)]/80 p-1 text-sm">
          {(
            [
              { id: "all", label: "All Posts" },
              { id: "near", label: "Near Me" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={
                "flex-1 rounded-full px-3 py-2 text-xs font-semibold transition " +
                (activeTab === tab.id
                  ? "bg-white text-[var(--color-ink)] shadow"
                  : "text-[var(--color-muted)] hover:text-[var(--color-ink)]")
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === "near" && !userCoords && (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Location not set — showing all posts.
          </p>
        )}
        {activeTab === "near" && userCoords && (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Showing posts within {NEARBY_RADIUS_KM} km of you.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {loading ? (
            <div className="rounded-[28px] border border-white/70 bg-white/80 p-6 text-sm text-[var(--color-muted)] shadow">
              Loading events…
            </div>
          ) : error ? (
            <div className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow">
              <div className="text-sm font-semibold text-rose-600">Couldn’t load events</div>
              <div className="mt-2 text-sm text-[var(--color-muted)]">
                {error}
                <div className="mt-2 text-[11px] text-[var(--color-muted)]">
                  Expected endpoint: <span className="font-mono">GET /api/events</span>
                </div>
              </div>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow">
              <div className="text-sm font-semibold text-[var(--color-ink)]">No matching posts</div>
              <div className="mt-2 text-sm text-[var(--color-muted)]">
                Try switching tabs or refresh the feed.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEvents.map((event, idx) => (
                <EventCard key={`${event.creator}-${event.dateTime}-${idx}`} event={event} index={idx} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-white/70 bg-white/80 p-4 shadow">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
              <Compass className="h-4 w-4 text-[var(--color-accent)]" />
              Quick insights
            </div>
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Track how the recommendation engine is balancing supply and demand.
            </p>
            {metrics ? (
              <div className="mt-3 grid gap-2 text-xs text-[var(--color-muted)]">
                <div className="flex items-center justify-between rounded-full bg-[var(--color-mist)]/80 px-3 py-2">
                  <span>Utilization</span>
                  <span className="font-semibold text-[var(--color-ink)]">
                    {(metrics.utilization * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-full bg-[var(--color-mist)]/80 px-3 py-2">
                  <span>Avg fill</span>
                  <span className="font-semibold text-[var(--color-ink)]">
                    {(metrics.avg_fill_ratio * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-full bg-[var(--color-mist)]/80 px-3 py-2">
                  <span>Fairness gap</span>
                  <span className="font-semibold text-[var(--color-ink)]">
                    {metrics.fairness_gap.toFixed(3)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-xs text-[var(--color-muted)]">Run a demo to load metrics.</div>
            )}
          </div>

          <div className="rounded-[28px] border border-white/70 bg-white/80 p-4 shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[var(--color-ink)]">Trending right now</div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">Top events gaining momentum.</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-[var(--color-accent)]" />
            </div>
            {movers.length > 0 ? (
              <div className="mt-3 space-y-2 text-xs text-[var(--color-muted)]">
                {movers.slice(0, 3).map((m) => (
                  <div
                    key={m.event_id}
                    className="flex items-center justify-between rounded-2xl bg-[var(--color-mist)]/80 px-3 py-2"
                  >
                    <span>{m.title}</span>
                    <span className="font-semibold text-[var(--color-accent)]">
                      {m.pulse_delta >= 0 ? "+" : ""}{m.pulse_delta.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs text-[var(--color-muted)]">No movers yet.</div>
            )}
          </div>

          <DemoPanel
            demoMode={demoMode}
            onToggle={() => setDemoMode((prev) => !prev)}
            demoBusy={demoBusy}
            demoError={demoError}
            onSimulate={simulateDemandSpike}
            onReset={resetDemo}
            metrics={metrics}
            movers={movers}
            feedPreview={feedPreview}
          />
        </div>
      </div>
    </div>
  );
}
