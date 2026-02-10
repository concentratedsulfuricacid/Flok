import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

export type Event = {
  description: string;
  creator: string;
  dateTime: string; // ISO for now
  participants: string[];
  capacity: number;
  isFull: boolean;
  location: string;
  tags: string[];
};

/**
 * TODO (backend): implement GET /api/events/recommended => Event[]
 * Backend returns the list already ordered (recommended ranking).
 */
export async function getRecommendedEvents(): Promise<Event[]> {
  const res = await fetch("/api/events/recommended", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
  return (await res.json()) as Event[];
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
    </div>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getRecommendedEvents();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Events</h1>
          <p className="mt-2 text-neutral-600">
            Recommended events (ordered by backend). We’ll add filters and join actions later.
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

      <div className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="text-neutral-600">Loading events…</div>
        ) : error ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-rose-700">Couldn’t load events</div>
            <div className="text-sm text-neutral-600">
              {error}
              <div className="mt-2 text-neutral-500">
                Expected endpoint: <span className="font-mono">GET /api/events/recommended</span>
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
            {events.map((e, idx) => (
              <EventCard key={`${e.creator}-${e.dateTime}-${idx}`} event={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
