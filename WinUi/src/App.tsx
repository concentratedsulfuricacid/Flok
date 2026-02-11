import React, { useMemo, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes, Navigate } from "react-router-dom";
import { Menu, X, MapPin, CalendarDays, Users, PlusCircle, User } from "lucide-react";

import MapPage from "./pages/MapPage";
import EventsPage from "./pages/EventsPage";
import FriendsPage from "./pages/FriendsPage";
import CreateEventPage from "./pages/CreateEventPage";
import ProfilePage from "./pages/ProfilePage";

const NAV_ITEMS = [
  { label: "Map", to: "/map", Icon: MapPin },
  { label: "Events", to: "/events", Icon: CalendarDays },
  { label: "Friends", to: "/friends", Icon: Users },
  { label: "Create Event", to: "/create-event", Icon: PlusCircle },
  { label: "Profile", to: "/profile", Icon: User },
];

function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const Brand = useMemo(
    () => (
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-400 to-amber-300 shadow-sm ring-1 ring-white/70">
          <span className="text-base font-extrabold tracking-tight text-white">F</span>
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-extrabold tracking-tight text-[var(--color-ink)] [font-family:var(--font-display)]">
            Flok
          </div>
          <div className="text-xs text-[var(--color-muted)]">Find your communities</div>
        </div>
      </div>
    ),
    []
  );

  const tabBase =
    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition";
  const tabActive =
    "bg-white text-[var(--color-ink)] ring-1 ring-white/70 shadow-sm";
  const tabInactive =
    "text-[var(--color-muted)] hover:bg-white/70 hover:text-[var(--color-ink)]";

  return (
    <div className="min-h-screen bg-transparent text-[var(--color-ink)]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/70 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center justify-between py-3">
            {/* Left: Brand */}
            {Brand}

            {/* Center: Tabs (desktop) */}
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map(({ label, to, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    [tabBase, isActive ? tabActive : tabInactive].join(" ")
                  }
                  end
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* Right: Header action + mobile menu */}
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center rounded-full bg-[var(--color-chip)] px-3 py-1 text-xs font-semibold text-[var(--color-accent)]">
                Prototype
              </span>

              <button
                className="md:hidden inline-flex items-center justify-center rounded-xl p-2 ring-1 ring-white/70 hover:bg-white/70"
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? "Close menu" : "Open menu"}
              >
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Tabs (mobile) */}
          {open && (
            <div className="md:hidden pb-4">
              <div className="grid gap-2">
                {NAV_ITEMS.map(({ label, to, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      [
                        "flex items-center gap-3 rounded-2xl px-3 py-3 ring-1 transition",
                        isActive
                          ? "bg-white text-[var(--color-ink)] ring-white/70"
                          : "bg-white/70 text-[var(--color-muted)] ring-white/60 hover:bg-white hover:text-[var(--color-ink)]",
                      ].join(" ")
                    }
                    end
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>

      {/* Footer */}
      <footer className="border-t border-white/70 bg-white/60">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-[var(--color-muted)]">
          © {new Date().getFullYear()} Flok — UI scaffold
        </div>
      </footer>
    </div>
  );
}

function EmptyPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          {title}
        </h1>
        <p className="mt-2 text-[var(--color-muted)]">
          This page is intentionally empty for now. We’ll add components here later.
        </p>
      </div>

      <div className="rounded-3xl border border-white/70 bg-white p-10 shadow-sm">
        <div className="text-[var(--color-muted)]">{title} content goes here…</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          {/* Make Map the landing page */}
          <Route path="/" element={<Navigate to="/map" replace />} />

          {/* Tabs */}
          <Route path="/map" element={<MapPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/create-event" element={<CreateEventPage />} />
          <Route path="/profile" element={<ProfilePage />} />

          {/* Backwards compatibility (if you used this old path before) */}
          <Route path="/nearby-events" element={<Navigate to="/events" replace />} />

          {/* Fallback */}
          <Route path="*" element={<EmptyPage title="Not Found" />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
