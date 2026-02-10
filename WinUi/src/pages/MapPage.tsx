import React, { useEffect, useMemo, useState } from "react";
import { loadDemoUserProfile } from "../demo/demoUserStore";
import type { DemoUserProfile } from "../demo/demoUserStore";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

// Fix default marker icons for Vite/React builds
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

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
  description: string;
  creator: string;
  dateTime: string; // ISO string for demo
  participants: string[]; // can change shape later
  capacity: number;
  isFull: boolean;
  location: { lat: number; lng: number; name: string };
  tags: string[];
};

/** TODO (backend): replace with API call later */
export async function getNearbyEvents(_user: UserProfile): Promise<Event[]> {
  // Demo events around Pasir Ris East
  return [
    {
      description: "Morning Run @ Pasir Ris Park",
      creator: "Coach Lynn",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 18).toISOString(),
      participants: ["Alicia", "Ben", "Chen"],
      capacity: 10,
      isFull: false,
      location: { lat: 1.3813, lng: 103.9496, name: "Pasir Ris Park" },
      tags: ["running", "beginner-friendly"],
    },
    {
      description: "Gentle Yoga (Seniors Welcome)",
      creator: "Yuna",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 30).toISOString(),
      participants: ["Dina", "Ethan"],
      capacity: 8,
      isFull: false,
      location: { lat: 1.3746, lng: 103.9514, name: "Pasir Ris Sports Centre (nearby)" },
      tags: ["yoga", "low-impact"],
    },
    {
      description: "Community Gardening Meetup",
      creator: "Mr Tan",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
      participants: ["Farah", "Gopal", "Hana", "Irfan"],
      capacity: 6,
      isFull: true,
      location: { lat: 1.3698, lng: 103.9572, name: "Pasir Ris Community Garden" },
      tags: ["gardening", "community"],
    },
  ];
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

  useEffect(() => {
    (async () => {
      const p = await loadDemoUserProfile();
      setDemoProfile(p);
    })();
  }, []);

  const user = useMemo<UserProfile | null>(() => {
    if (!demoProfile) return null;

    return {
      name: demoProfile.name,
      age: demoProfile.age,
      locationName: demoProfile.location,
      interests: demoProfile.interests,
      fitnessLevel: demoProfile.fitnessLevel,
      // still fixed for now (demo coords)
      coords: { lat: 1.3728, lng: 103.9493 },
    };
  }, [demoProfile]);

  const [events, setEvents] = useState<Event[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (u: UserProfile) => {
    setLoading(true);
    try {
      const list = await getNearbyEvents(u);
      setEvents(list);
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
            Demo: fixed user location + nearby event markers.
          </p>
        </div>

        <button
          onClick={() => load(user)}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
        >
          {loading ? "Loading…" : "Refresh events"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Map */}
        <div className="overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-sm">
          <div className="h-[520px]">
            <MapContainer
              center={[user.coords.lat, user.coords.lng]}
              zoom={14}
              scrollWheelZoom
              className="h-full w-full"
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* User marker */}
              <Marker position={[user.coords.lat, user.coords.lng]} icon={userIcon}>
                <Popup>
                  <div className="space-y-1">
                    <div className="font-semibold">{user.name}</div>
                    <div className="text-sm">Age: {user.age}</div>
                    <div className="text-sm">Area: {user.locationName}</div>
                    <div className="text-sm">Fitness: {user.fitnessLevel}/10</div>
                    <div className="text-sm">Interests: {user.interests.join(", ")}</div>
                  </div>
                </Popup>
              </Marker>

              {/* Event markers */}
              {nearbyEvents.map(({ event }, idx) => (
                <Marker
                  key={`${event.creator}-${event.dateTime}-${idx}`}
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
              <span className="font-medium">Location:</span> {user.locationName}
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
