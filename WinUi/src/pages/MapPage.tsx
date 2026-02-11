import { useEffect, useMemo, useState } from "react";
import { loadDemoUserProfile } from "../demo/demoUserStore";
import type { DemoUserProfile } from "../demo/demoUserStore";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

// Fix default marker icons for Vite/React builds
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? "aQZRdwxcsAjP1mu0xvTT";
const MAPTILER_TILE_URL = `https://api.maptiler.com/maps/base-v4/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`;
const MAPTILER_ATTRIBUTION =
  '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const GEOCODE_CACHE_STORAGE_KEY = "flok.map.geocodeCache.v1";
const GEOCODE_CACHE_MAX_ENTRIES = 300;

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export type UserProfile = {
  name: string;
  age: number;
  locationName: string;
  interests: string[];
  fitnessLevel: number; // out of 10
  coords: { lat: number; lng: number };
};

export type Event = {
  id: string;
  description: string;
  creator: string;
  dateTime: string; // ISO string for demo
  participants: string[]; // can change shape later
  capacity: number;
  isFull: boolean;
  location: { lat: number; lng: number; name: string };
  tags: string[];
};

type BackendEvent = {
  id: string;
  description: string;
  creator: string;
  dateTime: string;
  participants: string[];
  capacity: number;
  isFull: boolean;
  location: string;
  tags: string[];
};

const KNOWN_COORDS: Record<string, { lat: number; lng: number }> = {
  "pasir ris east": { lat: 1.3728, lng: 103.9493 },
  "pasir ris": { lat: 1.3728, lng: 103.9493 },
};
const AREA_CENTERS: Array<{ name: string; lat: number; lng: number }> = [
  { name: "Marina / Downtown", lat: 1.283, lng: 103.851 },
  { name: "Jurong East", lat: 1.333, lng: 103.742 },
  { name: "Tampines", lat: 1.349, lng: 103.944 },
  { name: "Woodlands", lat: 1.436, lng: 103.786 },
  { name: "Pasir Ris", lat: 1.373, lng: 103.949 },
];

const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
let geocodeCacheHydrated = false;

function hydrateGeocodeCache() {
  if (geocodeCacheHydrated) return;
  geocodeCacheHydrated = true;
  try {
    const raw = localStorage.getItem(GEOCODE_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, { lat: number; lng: number } | null>;
    Object.entries(parsed).forEach(([key, value]) => {
      geocodeCache.set(key, value);
    });
  } catch {
    // Ignore corrupted cache and continue with in-memory cache only.
  }
}

function persistGeocodeCache() {
  try {
    const entries = Array.from(geocodeCache.entries());
    const recent = entries.slice(Math.max(0, entries.length - GEOCODE_CACHE_MAX_ENTRIES));
    const payload = Object.fromEntries(recent);
    localStorage.setItem(GEOCODE_CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can fail (quota/private mode); non-fatal.
  }
}

function parseCoords(value: string | null | undefined): { lat: number; lng: number } | null {
  if (!value) return null;
  if (!value.includes(",")) return null;
  const [latRaw, lngRaw] = value.split(",", 2);
  const lat = Number(latRaw.trim());
  const lng = Number(lngRaw.trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function geocodeWithMaptiler(query: string): Promise<{ lat: number; lng: number } | null> {
  hydrateGeocodeCache();
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (geocodeCache.has(key)) {
    return geocodeCache.get(key) ?? null;
  }

  try {
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(
      query
    )}.json?key=${MAPTILER_KEY}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) {
      geocodeCache.set(key, null);
      persistGeocodeCache();
      return null;
    }
    const data = (await res.json()) as {
      features?: Array<{ center?: [number, number] }>;
    };
    const center = data.features?.[0]?.center;
    if (!center || center.length < 2) {
      geocodeCache.set(key, null);
      persistGeocodeCache();
      return null;
    }
    const coords = { lat: center[1], lng: center[0] };
    geocodeCache.set(key, coords);
    persistGeocodeCache();
    return coords;
  } catch {
    geocodeCache.set(key, null);
    persistGeocodeCache();
    return null;
  }
}

async function resolveLocationToCoords(
  value: string | null | undefined
): Promise<{ lat: number; lng: number } | null> {
  if (!value) return null;
  const parsed = parseCoords(value);
  if (parsed) return parsed;
  const known = KNOWN_COORDS[value.trim().toLowerCase()];
  if (known) return known;
  return geocodeWithMaptiler(value);
}

function formatLocationName(raw: string, coords: { lat: number; lng: number }) {
  if (raw && !raw.includes(",")) return raw;
  let nearest = AREA_CENTERS[0];
  let best = Number.POSITIVE_INFINITY;
  for (const area of AREA_CENTERS) {
    const distance = haversineKm(coords, { lat: area.lat, lng: area.lng });
    if (distance < best) {
      best = distance;
      nearest = area;
    }
  }
  return nearest.name;
}

export async function getNearbyEvents(_user: UserProfile): Promise<Event[]> {
  const userId = localStorage.getItem("flok.apiUserId");
  const url = userId ? `/api/events?user_id=${encodeURIComponent(userId)}` : "/api/events";
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch events: ${res.status}`);
  }

  const rows = (await res.json()) as BackendEvent[];
  const events = await Promise.all(
    rows.map(async (row) => {
      const coords = await resolveLocationToCoords(row.location);
      if (!coords) return null;
      return {
        id: row.id,
        description: row.description,
        creator: row.creator,
        dateTime: row.dateTime,
        participants: row.participants ?? [],
        capacity: row.capacity,
        isFull: row.isFull,
        location: {
          lat: coords.lat,
          lng: coords.lng,
          name: formatLocationName(row.location, coords),
        },
        tags: row.tags ?? [],
      } satisfies Event;
    })
  );
  return events.filter((event): event is Event => event !== null);
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

const userIcon = L.divIcon({
  className: "",
  html: `
    <div style="
      width: 18px; height: 18px; border-radius: 999px;
      background: #fb7185; /* rose-400 */
      border: 3px solid white;
      box-shadow: 0 0 0 3px rgba(251,113,133,.25);
    "></div>
  `,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const eventIcon = L.divIcon({
  className: "",
  html: `
    <div style="
      width: 14px; height: 14px; border-radius: 999px;
      background: #f472b6; /* pink-400 */
      border: 3px solid white;
      box-shadow: 0 0 0 3px rgba(244,114,182,.25);
    "></div>
  `,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export default function MapPage() {
  const [demoProfile, setDemoProfile] = useState<DemoUserProfile | null>(null);
  const [highContrastMap, setHighContrastMap] = useState(false);
  const [resolvedUserCoords, setResolvedUserCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );

  useEffect(() => {
    (async () => {
      const p = await loadDemoUserProfile();
      setDemoProfile(p);
    })();
  }, []);

  useEffect(() => {
    if (!demoProfile) return;
    let active = true;
    void (async () => {
      const coords = await resolveLocationToCoords(demoProfile.location);
      if (!active) return;
      setResolvedUserCoords(coords ?? KNOWN_COORDS["pasir ris east"]);
    })();
    return () => {
      active = false;
    };
  }, [demoProfile]);

  const user = useMemo<UserProfile | null>(() => {
    if (!demoProfile) return null;

    return {
      name: demoProfile.name,
      age: demoProfile.age,
      locationName: demoProfile.location,
      interests: demoProfile.interests,
      fitnessLevel: demoProfile.fitnessLevel,
      coords: resolvedUserCoords ?? KNOWN_COORDS["pasir ris east"],
    };
  }, [demoProfile, resolvedUserCoords]);

  const [events, setEvents] = useState<Event[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (u: UserProfile) => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await getNearbyEvents(u);
      setEvents(list);
    } catch (error) {
      setEvents([]);
      setLoadError(error instanceof Error ? error.message : "Failed to load map events.");
    } finally {
      setLoading(false);
    }
  };

  // Load once when user becomes available
  useEffect(() => {
    if (!user) return;
    void load(user);
  }, [user]);

  const nearbyEvents = useMemo(() => {
    if (!user) return [];
    const list = events ?? [];

    // Filter within 3km for demo
    return list
      .map((e) => ({
        event: e,
        distanceKm: haversineKm(user.coords, { lat: e.location.lat, lng: e.location.lng }),
      }))
      .filter((x) => x.distanceKm <= 3)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [events, user]);
  const mappedEvents = events ?? [];

  // IMPORTANT: render guard AFTER all hooks (prevents blank/crash)
  if (!user) {
    return <div className="text-neutral-600">Loading profile…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Map</h1>
          <p className="mt-2 text-neutral-600">
            MapTiler map with your events plotted at resolved coordinates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHighContrastMap((prev) => !prev)}
            aria-pressed={highContrastMap}
            className={
              "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition " +
              (highContrastMap
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-rose-200 bg-white text-neutral-800 hover:bg-rose-50")
            }
          >
            {highContrastMap ? "High contrast: On" : "High contrast: Off"}
          </button>
          <button
            onClick={() => load(user)}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Refresh events"}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Map */}
        <div className="overflow-hidden rounded-3xl border border-rose-200 shadow-sm">
          <MapContainer
            center={[user.coords.lat, user.coords.lng]}
            zoom={14}
            scrollWheelZoom
            className="h-[520px] w-full"
            style={
              highContrastMap
                ? { filter: "grayscale(0.1) contrast(1.35) saturate(0.85)" }
                : undefined
            }
          >
            <TileLayer
              attribution={MAPTILER_ATTRIBUTION}
              url={MAPTILER_TILE_URL}
            />

            {/* User marker */}
            <Marker position={[user.coords.lat, user.coords.lng]} icon={userIcon}>
              <Popup>
                <div className="space-y-1">
                  <div className="font-semibold">{user.name}</div>
                  <div className="text-sm">Age: {user.age}</div>
                  <div className="text-sm">Area: {formatLocationName(user.locationName, user.coords)}</div>
                  <div className="text-sm">Fitness: {user.fitnessLevel}/10</div>
                  <div className="text-sm">Interests: {user.interests.join(", ")}</div>
                </div>
              </Popup>
            </Marker>

            {/* Event markers */}
            {mappedEvents.map((event, idx) => (
              <Marker
                key={`${event.id}-${idx}`}
                position={[event.location.lat, event.location.lng]}
                icon={eventIcon}
              >
                <Popup>
                  <div className="space-y-1">
                    <div className="font-semibold">{event.description}</div>
                    <div className="text-sm text-neutral-700">By {event.creator}</div>
                    <div className="text-sm">{new Date(event.dateTime).toLocaleString()}</div>
                    <div className="text-sm">
                      {event.participants.length}/{event.capacity} {event.isFull ? "(Full)" : ""}
                    </div>
                    <div className="text-sm text-neutral-700">{event.location.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {event.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Sidebar list */}
        <div className="rounded-3xl border border-rose-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-neutral-900">Demo Profile</div>
          <div className="mt-2 text-sm text-neutral-600">
            <div>
              <span className="font-medium">Name:</span> {user.name}
            </div>
            <div>
              <span className="font-medium">Age:</span> {user.age}
            </div>
            <div>
              <span className="font-medium">Location:</span> {formatLocationName(user.locationName, user.coords)}
            </div>
            <div>
              <span className="font-medium">Fitness:</span> {user.fitnessLevel}/10
            </div>
            <div>
              <span className="font-medium">Interests:</span> {user.interests.join(", ")}
            </div>
          </div>

          <div className="mt-5 border-t border-rose-100 pt-4">
            <div className="text-sm font-semibold text-neutral-900">
              Nearby Events ({nearbyEvents.length})
            </div>
            <div className="mt-3 space-y-3">
              {nearbyEvents.length === 0 ? (
                <div className="text-sm text-neutral-600">No events within 3km.</div>
              ) : (
                nearbyEvents.map(({ event, distanceKm }, idx) => (
                  <div
                    key={`${event.description}-${idx}`}
                    className="rounded-2xl border border-rose-200 bg-rose-50/40 p-3"
                  >
                    <div className="font-semibold text-neutral-900">{event.description}</div>
                    <div className="text-sm text-neutral-600">
                      {event.location.name} · {distanceKm.toFixed(1)} km
                    </div>
                    <div className="text-sm text-neutral-600">
                      {event.participants.length}/{event.capacity}{" "}
                      {event.isFull ? "· Full" : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
