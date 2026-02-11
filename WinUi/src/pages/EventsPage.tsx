import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  RefreshCw,
  Sparkles,
  ArrowUpRight,
  Compass,
  CalendarDays,
  MapPin,
  Users,
} from "lucide-react";
import { loadDemoUserProfile } from "../demo/demoUserStore";
import type { DemoUserProfile } from "../demo/demoUserStore";

export type Event = {
  id: string;
  description: string;
  creator: string;
  dateTime: string; // ISO for now
  participants: string[];
  capacity: number;
  isFull: boolean;
  location: string;
  tags: string[];
  imageUrl?: string;
  fitScore?: number;
  pulse?: number;
  reasons?: string[];
  eligible?: boolean;
  blocked_reasons?: string[];
  blocked_reason_text?: string[];
  s_adj?: number;
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

type DemoSimulateResponse = {
  event_id: string;
  before_pulse: number;
  after_pulse: number;
  before_fill: number;
  after_fill: number;
  movers?: TrendingItem[];
};

type DemoUserInfo = {
  user_id: string;
  label: string;
  name: string;
  interests: string[];
  availability: string[];
  goal?: string | null;
  max_travel_mins?: number | null;
  group_pref?: string | null;
  intensity_pref?: string | null;
  location?: string | null;
};

type DemoSetupResponse = {
  hot_event_id: string;
  hot_event_title: string;
  users: DemoUserInfo[];
};

type RSVPResponse = {
  event_id: string;
  status: "CONFIRMED" | "FULL" | "WAITLISTED" | "CANCELLED";
  spots_left: number;
};

type FeedTab = "all" | "near";
type PopupTone = "success" | "error" | "info";
type ConfirmDialog = {
  eventId: string;
  action: "rsvp" | "cancel_rsvp";
  prompt: string;
};

const NEARBY_RADIUS_KM = 5;

/**
 * Recommended list already ordered by the backend's final ranking score.
 */
export async function getAllEvents(userId?: string): Promise<Event[]> {
  const url = userId
    ? `/api/events/recommended?user_id=${encodeURIComponent(userId)}`
    : "/api/events/recommended";
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
  return (await res.json()) as Event[];
}

async function rsvpForEvent(eventId: string, userId: string): Promise<RSVPResponse> {
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) throw new Error(`Failed to RSVP: ${res.status}`);
  return (await res.json()) as RSVPResponse;
}

async function unRsvpForEvent(eventId: string, userId: string): Promise<RSVPResponse> {
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/rsvp`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) throw new Error(`Failed to un-RSVP: ${res.status}`);
  return (await res.json()) as RSVPResponse;
}

async function setupDemoScenario(): Promise<DemoSetupResponse> {
  const res = await fetch("/demo/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to setup demo: ${res.status}`);
  return (await res.json()) as DemoSetupResponse;
}

async function spikeDemo(level: number, hotEventId: string): Promise<DemoSimulateResponse> {
  const res = await fetch("/demo/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, hot_event_id: hotEventId }),
  });
  if (!res.ok) throw new Error(`Failed to spike demo: ${res.status}`);
  return (await res.json()) as DemoSimulateResponse;
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

const fallbackImageForEvent = (event: Event): string => {
  const curated = {
    wellness: "https://images.unsplash.com/photo-1485727749690-d091e8284ef3?auto=format&fit=crop&w=1400&q=80",
    food: "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1400&q=80",
    music: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=80",
    arts: "https://images.unsplash.com/photo-1511988617509-a57c8a288659?auto=format&fit=crop&w=1400&q=80",
  } as const;
  const generalPool = [
    "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80",
  ] as const;
  const lowerTags = event.tags.map((t) => t.toLowerCase());
  if (lowerTags.some((t) => t.includes("yoga") || t.includes("fitness"))) {
    return curated.wellness;
  }
  if (lowerTags.some((t) => t.includes("food") || t.includes("cook"))) {
    return curated.food;
  }
  if (lowerTags.some((t) => t.includes("music") || t.includes("dance"))) {
    return curated.music;
  }
  if (lowerTags.some((t) => t.includes("art") || t.includes("craft"))) {
    return curated.arts;
  }
  const hash = [...event.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return generalPool[hash % generalPool.length];
};

const parseLocation = (value?: string | null) => {
  if (!value) return null;

  const trimmed = value.trim();
  if (trimmed.includes(",")) {
    const [latRaw, lngRaw] = trimmed.split(",", 2);
    const lat = Number(latRaw.trim());
    const lng = Number(lngRaw.trim());
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  }

  // Demo-friendly fallback for named locations.
  const key = trimmed.toLowerCase();
  const named: Record<string, { lat: number; lng: number }> = {
    "pasir ris east": { lat: 1.3728, lng: 103.9493 },
    "pasir ris": { lat: 1.3728, lng: 103.9493 },
  };
  return named[key] ?? null;
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

function EventCard({
  event,
  index,
  onOpenDetails,
  onRsvp,
  onUnRsvp,
  isRsvped,
  rsvpBusy,
}: {
  event: Event;
  index: number;
  onOpenDetails?: () => void;
  onRsvp?: () => void;
  onUnRsvp?: () => void;
  isRsvped?: boolean;
  rsvpBusy?: boolean;
}) {
  const dt = useMemo(() => new Date(event.dateTime), [event.dateTime]);
  const spotsLeft = Math.max(event.capacity - event.participants.length, 0);
  const fillRatio = event.capacity ? event.participants.length / event.capacity : 0;
  const eligible = event.eligible ?? true;
  const status = event.isFull
    ? "Full"
    : eligible
      ? "Recommended for you"
      : "Not eligible";
  const statusTone = event.isFull || !eligible
    ? "bg-[var(--color-mist)] text-[var(--color-muted)]"
    : "bg-[var(--color-accent)] text-white";
  const imageSrc = event.imageUrl || fallbackImageForEvent(event);

  return (
    <article
      className={
        "group relative overflow-hidden rounded-[28px] border p-4 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.6)] backdrop-blur motion-safe:animate-[fade-up_0.7s_ease-out] " +
        (isRsvped
          ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,white)] ring-2 ring-[color-mix(in_srgb,var(--color-accent)_35%,white)]"
          : "border-white/70 bg-white/80")
      }
      style={{ animationDelay: `${index * 70}ms` }}
      onClick={onOpenDetails}
      onKeyDown={(e) => {
        if (!onOpenDetails) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetails();
        }
      }}
      role={onOpenDetails ? "button" : undefined}
      tabIndex={onOpenDetails ? 0 : undefined}
    >
      <div className="absolute -right-6 top-8 h-20 w-20 rounded-full bg-[radial-gradient(circle,rgba(47,143,131,0.35),transparent_70%)] opacity-0 transition duration-500 group-hover:opacity-100" />
      <img
        src={imageSrc}
        alt={event.description}
        className="mb-4 h-40 w-full rounded-2xl object-cover"
        loading="lazy"
      />

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
        {!eligible && event.blocked_reason_text && event.blocked_reason_text.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {event.blocked_reason_text.map((reason) => (
              <span
                key={reason}
                className="rounded-full bg-[var(--color-mist)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]"
              >
                {reason}
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 text-sm text-[var(--color-muted)]">
          {eligible
            ? event.isFull
              ? "This gathering is currently full."
              : `Looking for ${spotsLeft} more participant${spotsLeft === 1 ? "" : "s"}.`
            : "Not eligible right now."}
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
          {event.participants.length}/{event.capacity} spots rsvp-ed
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

      <div className="mt-4">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!onRsvp && !onUnRsvp) return;
            if (isRsvped) onUnRsvp?.();
            else onRsvp?.();
          }}
          disabled={!onRsvp || (event.isFull && !isRsvped) || Boolean(rsvpBusy)}
          className={
            "inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm transition " +
            (!onRsvp || (event.isFull && !isRsvped)
              ? "cursor-not-allowed border border-[var(--color-mist)] bg-[var(--color-mist)] text-[var(--color-muted)]"
              : isRsvped
                ? "border-2 border-[var(--color-accent)] bg-white text-[var(--color-accent)] hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-70"
                : "bg-[var(--color-accent)] text-white hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-70")
          }
        >
          {!onRsvp || (event.isFull && !isRsvped)
            ? "Full"
            : rsvpBusy
              ? (isRsvped ? "Cancelling..." : "RSVPing...")
              : (isRsvped ? "Cancel RSVP" : "RSVP")}
        </button>
      </div>
    </article>
  );
}

function DemoPanel({
  demoMode,
  onToggle,
  demoBusy,
  demoError,
  scenario,
  demoPulse,
  demoLevel,
  onSetup,
  onPopulate,
  onSpike,
}: {
  demoMode: boolean;
  onToggle: () => void;
  demoBusy: boolean;
  demoError: string | null;
  scenario: DemoSetupResponse | null;
  demoPulse: number | null;
  demoLevel: number;
  onSetup: () => void;
  onPopulate: () => void;
  onSpike: (level: number) => void;
}) {
  const demoActive = Boolean(scenario);
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
              onClick={onSetup}
              disabled={demoBusy}
              className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
            >
              Setup demo scenario
            </button>
            <button
              onClick={onPopulate}
              disabled={demoBusy || demoActive}
              className="rounded-full border border-[var(--color-mist)] bg-white px-4 py-2 text-xs font-semibold text-[var(--color-muted)] transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
            >
              Populate events
            </button>
          </div>
          {demoActive && (
            <div className="text-[10px] text-[var(--color-muted)]">
              Demo scenario active. Toggle off Demo Lab to exit.
            </div>
          )}
          {demoError && <div className="text-xs font-semibold text-rose-600">{demoError}</div>}

          {scenario && (
            <div className="space-y-3 rounded-2xl bg-[var(--color-mist)]/80 p-3 text-xs text-[var(--color-muted)]">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[var(--color-ink)]">{scenario.hot_event_title}</div>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-[var(--color-accent)]">
                  Level {demoLevel}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Pulse</span>
                <span className="font-semibold text-[var(--color-ink)]">
                  {demoPulse ? demoPulse.toFixed(1) : "—"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3].map((level) => (
                  <button
                    key={level}
                    onClick={() => onSpike(level)}
                    disabled={demoBusy}
                    className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-[var(--color-ink)] ring-1 ring-white/60 transition hover:-translate-y-0.5 hover:shadow disabled:opacity-60"
                  >
                    Spike level {level}
                  </button>
                ))}
              </div>
              <div className="space-y-2 pt-2">
                {scenario.users.map((user) => (
                  <div key={user.user_id} className="rounded-2xl bg-white/80 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-[var(--color-ink)]">{user.label}</div>
                      <div className="text-[10px] text-[var(--color-muted)]">{user.name}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[var(--color-muted)]">
                      {user.location && (
                        <span className="rounded-full bg-[var(--color-mist)] px-2 py-1">
                          {user.location}
                        </span>
                      )}
                      {user.goal && (
                        <span className="rounded-full bg-[var(--color-mist)] px-2 py-1">
                          Goal: {user.goal}
                        </span>
                      )}
                      {typeof user.max_travel_mins === "number" && (
                        <span className="rounded-full bg-[var(--color-mist)] px-2 py-1">
                          {user.max_travel_mins} min travel
                        </span>
                      )}
                      {user.group_pref && (
                        <span className="rounded-full bg-[var(--color-mist)] px-2 py-1">
                          Group: {user.group_pref}
                        </span>
                      )}
                      {user.intensity_pref && (
                        <span className="rounded-full bg-[var(--color-mist)] px-2 py-1">
                          Intensity: {user.intensity_pref}
                        </span>
                      )}
                      {user.availability?.length ? (
                        <span className="rounded-full bg-[var(--color-mist)] px-2 py-1">
                          Avail: {user.availability.join(", ")}
                        </span>
                      ) : null}
                    </div>
                    {user.interests?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {user.interests.map((interest) => (
                          <span
                            key={interest}
                            className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent)] ring-1 ring-white/60"
                          >
                            {interest}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
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
  const [metrics, setMetrics] = useState<MetricsResponse["metrics"] | null>(null);
  const [movers, setMovers] = useState<TrendingItem[]>([]);
  const [demoScenario, setDemoScenario] = useState<DemoSetupResponse | null>(null);
  const [demoFeeds, setDemoFeeds] = useState<Record<string, Event[]>>({});
  const [demoPulse, setDemoPulse] = useState<number | null>(null);
  const [demoLevel, setDemoLevel] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<FeedTab>("all");
  const [rsvpBusyByEvent, setRsvpBusyByEvent] = useState<Record<string, boolean>>({});
  const [popup, setPopup] = useState<{ message: string; tone: PopupTone } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const userCoords = useMemo(() => parseLocation(demoUser?.location), [demoUser?.location]);

  const filteredEvents = useMemo(() => {
    if (activeTab === "all") return events;
    if (!userCoords) return events;
    return events.filter((event) => {
      const coords = parseLocation(event.location);
      if (!coords) return false;
      return haversineKm(userCoords, coords) <= NEARBY_RADIUS_KM;
    });
  }, [activeTab, events, userCoords]);

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

  useEffect(() => {
    (async () => {
      try {
        const metricsRes = await getMetrics();
        setMetrics(metricsRes.metrics);
      } catch {
        setMetrics(null);
      }
    })();
    (async () => {
      try {
        const trendingItems = await getTrending(5);
        setMovers(trendingItems);
      } catch {
        setMovers([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!popup) return;
    const timer = window.setTimeout(() => setPopup(null), 3200);
    return () => window.clearTimeout(timer);
  }, [popup]);

  useEffect(() => {
    if (!selectedEvent) return;
    const allDemoItems = Object.values(demoFeeds).flat();
    const refreshed =
      events.find((event) => event.id === selectedEvent.id) ??
      allDemoItems.find((event) => event.id === selectedEvent.id);
    if (refreshed) {
      setSelectedEvent(refreshed);
    }
  }, [events, demoFeeds, selectedEvent]);

  const loadDemoFeeds = async (users: DemoUserInfo[]) => {
    const results = await Promise.all(
      users.map(async (user) => ({ userId: user.user_id, items: await getAllEvents(user.user_id) }))
    );
    const next: Record<string, Event[]> = {};
    results.forEach((res) => {
      next[res.userId] = res.items;
    });
    setDemoFeeds(next);
  };

  const setupDemo = async () => {
    setDemoBusy(true);
    setDemoError(null);
    try {
      const scenario = await setupDemoScenario();
      setDemoScenario(scenario);
      setDemoLevel(0);
      setDemoPulse(50);
      await loadDemoFeeds(scenario.users);
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : "Failed to setup demo.");
    } finally {
      setDemoBusy(false);
    }
  };

  const populateEvents = async () => {
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
      setDemoScenario(null);
      setDemoFeeds({});
      setDemoLevel(0);
      setDemoPulse(null);
      const uid = await ensureUserId(true);
      if (uid) {
        await load();
      }
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : "Failed to populate events.");
    } finally {
      setDemoBusy(false);
    }
  };

  const spikeLevel = async (level: number) => {
    if (!demoScenario) return;
    setDemoBusy(true);
    setDemoError(null);
    try {
      const res = await spikeDemo(level, demoScenario.hot_event_id);
      setDemoPulse(res.after_pulse);
      setDemoLevel(level);
      if (res.movers && res.movers.length > 0) {
        setMovers(res.movers);
      }
      await loadDemoFeeds(demoScenario.users);
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : "Demo spike failed.");
    } finally {
      setDemoBusy(false);
    }
  };

  const performRsvp = async (eventId: string) => {
    setRsvpBusyByEvent((prev) => ({ ...prev, [eventId]: true }));
    try {
      const uid = await ensureUserId();
      if (!uid) throw new Error("Unable to RSVP without a user profile.");
      const result = await rsvpForEvent(eventId, uid);
      if (result.status === "FULL") {
        setPopup({ message: "This event is currently full.", tone: "info" });
      } else {
        setPopup({ message: "RSVP confirmed.", tone: "success" });
      }
      await load();
      if (demoScenario) {
        await loadDemoFeeds(demoScenario.users);
      }
    } catch (e) {
      setPopup({ message: e instanceof Error ? e.message : "Failed to RSVP.", tone: "error" });
    } finally {
      setRsvpBusyByEvent((prev) => ({ ...prev, [eventId]: false }));
    }
  };

  const performUnRsvp = async (eventId: string) => {
    setRsvpBusyByEvent((prev) => ({ ...prev, [eventId]: true }));
    try {
      const uid = await ensureUserId();
      if (!uid) throw new Error("Unable to un-RSVP without a user profile.");
      await unRsvpForEvent(eventId, uid);
      setPopup({ message: "Your RSVP has been removed.", tone: "success" });
      await load();
      if (demoScenario) {
        await loadDemoFeeds(demoScenario.users);
      }
    } catch (e) {
      setPopup({ message: e instanceof Error ? e.message : "Failed to un-RSVP.", tone: "error" });
    } finally {
      setRsvpBusyByEvent((prev) => ({ ...prev, [eventId]: false }));
    }
  };

  const handleRsvp = (eventId: string) => {
    const allDemoItems = Object.values(demoFeeds).flat();
    const targetEvent = events.find((event) => event.id === eventId) ?? allDemoItems.find((event) => event.id === eventId);
    setConfirmDialog({
      eventId,
      action: "rsvp",
      prompt: targetEvent
        ? `Confirm RSVP for \"${targetEvent.description}\"?`
        : "Confirm RSVP for this event?",
    });
  };

  const handleUnRsvp = (eventId: string) => {
    const allDemoItems = Object.values(demoFeeds).flat();
    const targetEvent = events.find((event) => event.id === eventId) ?? allDemoItems.find((event) => event.id === eventId);
    setConfirmDialog({
      eventId,
      action: "cancel_rsvp",
      prompt: targetEvent
        ? `Remove your RSVP for \"${targetEvent.description}\"?`
        : "Remove your RSVP for this event?",
    });
  };

  const confirmDialogAction = () => {
    if (!confirmDialog) return;
    const { eventId, action } = confirmDialog;
    setConfirmDialog(null);
    setSelectedEvent(null);
    if (action === "rsvp") {
      void performRsvp(eventId);
      return;
    }
    void performUnRsvp(eventId);
  };

  const greetingName = demoUser?.name ?? "there";
  const showMainFeed = !(demoMode && demoScenario);
  const selectedEventIsRsvped = Boolean(
    selectedEvent && userId && selectedEvent.participants.includes(userId)
  );
  const selectedEventBusy = Boolean(selectedEvent && rsvpBusyByEvent[selectedEvent.id]);

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
          {showMainFeed && (
            <>
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
                    <EventCard
                      key={event.id}
                      event={event}
                      index={idx}
                      onOpenDetails={() => setSelectedEvent(event)}
                      isRsvped={Boolean(userId && event.participants.includes(userId))}
                      onRsvp={() => void handleRsvp(event.id)}
                      onUnRsvp={() => void handleUnRsvp(event.id)}
                      rsvpBusy={Boolean(rsvpBusyByEvent[event.id])}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {demoMode && demoScenario && (
            <section className="mt-6 space-y-4">
              <div>
                <div className="text-sm font-semibold text-[var(--color-ink)]">Demo feeds</div>
                <p className="text-xs text-[var(--color-muted)]">
                  Ranked after spike level {demoLevel}.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {demoScenario.users.map((user) => {
                  const items = demoFeeds[user.user_id] ?? [];
                  return (
                    <div
                      key={user.user_id}
                      className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-[var(--color-ink)]">
                          {user.label}
                        </div>
                        <div className="text-xs text-[var(--color-muted)]">{user.name}</div>
                      </div>
                      {items.length > 0 ? (
                        <div className="mt-3 space-y-3">
                          {items.slice(0, 4).map((event, idx) => (
                            <EventCard
                              key={`${user.user_id}-${event.id}`}
                              event={event}
                              index={idx}
                              onOpenDetails={() => setSelectedEvent(event)}
                              isRsvped={Boolean(userId && event.participants.includes(userId))}
                              onRsvp={() => void handleRsvp(event.id)}
                              onUnRsvp={() => void handleUnRsvp(event.id)}
                              rsvpBusy={Boolean(rsvpBusyByEvent[event.id])}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-[var(--color-muted)]">
                          No feed yet.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
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
            onToggle={() => {
              setDemoMode((prev) => {
                const next = !prev;
                if (!next) {
                  setDemoScenario(null);
                  setDemoFeeds({});
                  setDemoLevel(0);
                  setDemoPulse(null);
                  setDemoError(null);
                }
                return next;
              });
            }}
            demoBusy={demoBusy}
            demoError={demoError}
            scenario={demoScenario}
            demoPulse={demoPulse}
            demoLevel={demoLevel}
            onSetup={setupDemo}
            onPopulate={populateEvents}
            onSpike={spikeLevel}
          />
        </div>
      </div>

      {popup && (
        <div className="pointer-events-none fixed right-6 top-24 z-[80]">
          <div
            className={
              "rounded-xl border px-4 py-3 text-sm font-semibold shadow-xl backdrop-blur " +
              (popup.tone === "success"
                ? "border-emerald-200 bg-emerald-50/95 text-emerald-800"
                : popup.tone === "error"
                  ? "border-rose-200 bg-rose-50/95 text-rose-700"
                  : "border-slate-200 bg-white/95 text-slate-700")
            }
            role="status"
            aria-live="polite"
          >
            {popup.message}
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-900/35 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-white/80 bg-white p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm RSVP action"
          >
            <p className="text-sm font-semibold text-[var(--color-ink)]">{confirmDialog.prompt}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="rounded-xl border border-[var(--color-mist)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-[var(--color-mist)]/60"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialogAction}
                className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 z-[85] grid place-items-center bg-slate-900/35 p-4">
          <div
            className="w-full max-w-xl rounded-3xl border border-white/80 bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Event details"
          >
            <img
              src={selectedEvent.imageUrl || fallbackImageForEvent(selectedEvent)}
              alt={selectedEvent.description}
              className="mb-4 h-48 w-full rounded-2xl object-cover"
              loading="lazy"
            />
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-[var(--color-ink)]">
                  {selectedEvent.description}
                </div>
                <div className="mt-1 text-sm text-[var(--color-muted)]">by {selectedEvent.creator}</div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="rounded-lg border border-[var(--color-mist)] px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)] transition hover:bg-[var(--color-mist)]/60"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-2 text-sm text-[var(--color-ink)]">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
                <span className="font-semibold">When:</span>
                <span>
                  {new Date(selectedEvent.dateTime).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
                <span className="font-semibold">Where:</span>
                <span>{selectedEvent.location}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
                <span className="font-semibold">Attendees:</span>
                <span>
                  {selectedEvent.participants.length}/{selectedEvent.capacity}
                </span>
              </div>
              {selectedEvent.tags.length > 0 && (
                <div className="pt-1">
                  <div className="mb-2 font-semibold">Tags</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedEvent.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-[var(--color-chip)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-accent)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selectedEvent.reasons && selectedEvent.reasons.length > 0 && (
                <div className="pt-1">
                  <div className="mb-2 font-semibold">Why this is recommended</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedEvent.reasons.map((reason) => (
                      <span
                        key={reason}
                        className="rounded-full bg-[var(--color-mist)] px-3 py-1 text-[11px] font-semibold text-[var(--color-accent)]"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6">
              <button
                onClick={() =>
                  selectedEventIsRsvped
                    ? void handleUnRsvp(selectedEvent.id)
                    : void handleRsvp(selectedEvent.id)
                }
                disabled={selectedEvent.isFull && !selectedEventIsRsvped}
                className={
                  "w-full rounded-2xl px-4 py-3 text-sm font-semibold transition " +
                  ((selectedEvent.isFull && !selectedEventIsRsvped)
                    ? "cursor-not-allowed border border-[var(--color-mist)] bg-[var(--color-mist)] text-[var(--color-muted)]"
                    : selectedEventIsRsvped
                      ? "border-2 border-[var(--color-accent)] bg-white text-[var(--color-accent)] hover:bg-[var(--color-mist)]/35"
                      : "bg-[var(--color-accent)] text-white hover:opacity-90")
                }
              >
                {selectedEventBusy
                  ? (selectedEventIsRsvped ? "Cancelling..." : "RSVPing...")
                  : selectedEventIsRsvped
                    ? "Cancel RSVP"
                    : (selectedEvent.isFull ? "Full" : "RSVP")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
