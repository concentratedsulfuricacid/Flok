import React, { useMemo, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes, Navigate } from "react-router-dom";
import { Menu, X, MapPin, CalendarDays, Users, PlusCircle, User } from "lucide-react";

const NAV_ITEMS = [
  { label: "Map", to: "/map", Icon: MapPin },
  { label: "Nearby Events", to: "/nearby-events", Icon: CalendarDays },
  { label: "Friends", to: "/friends", Icon: Users },
  { label: "Create Event", to: "/create-event", Icon: PlusCircle },
  { label: "Profile", to: "/profile", Icon: User },
];

function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const linkBase =
    "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition";
  const linkActive = "bg-white/10 text-white";
  const linkInactive = "text-white/70 hover:bg-white/10 hover:text-white";

  const Brand = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
          <span className="text-base font-extrabold tracking-tight text-white">F</span>
        </div>
        <div className="leading-tight">
          <div className="text-white text-base font-extrabold tracking-tight">Flok</div>
          <div className="text-white/60 text-xs">Find your people</div>
        </div>
      </div>
    ),
    []
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Top header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          {Brand}

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-2">
            {NAV_ITEMS.map(({ label, to, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  [
                    linkBase,
                    isActive ? linkActive : linkInactive,
                    "ring-1 ring-white/10",
                  ].join(" ")
                }
                end
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Mobile menu button */}
          <button
            className="md:hidden inline-flex items-center justify-center rounded-xl p-2 ring-1 ring-white/10 hover:bg-white/10"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile nav */}
        {open && (
          <div className="md:hidden border-t border-white/10">
            <div className="mx-auto max-w-6xl px-4 py-3">
              <div className="grid gap-2">
                {NAV_ITEMS.map(({ label, to, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      [
                        "flex items-center gap-3 rounded-2xl px-3 py-3 ring-1 ring-white/10 transition",
                        isActive ? "bg-white/10" : "hover:bg-white/10",
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
          </div>
        )}
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-4 py-10">
        {/* Optional hero (shows on the first route you land on) */}
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-white/60">
          © {new Date().getFullYear()} Flok — Prototype UI
        </div>
      </footer>
    </div>
  );
}

function EmptyPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-white/60">
          This page is intentionally empty for now. Add your content here.
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <div className="text-white/60">{title} content goes here…</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          {/* Landing: send to Map by default */}
          <Route path="/" element={<Navigate to="/map" replace />} />

          {/* Tabs */}
          <Route path="/map" element={<EmptyPage title="Map" />} />
          <Route path="/nearby-events" element={<EmptyPage title="Nearby Events" />} />
          <Route path="/friends" element={<EmptyPage title="Friends" />} />
          <Route path="/create-event" element={<EmptyPage title="Create Event" />} />
          <Route path="/profile" element={<EmptyPage title="Profile" />} />

          {/* Fallback */}
          <Route path="*" element={<EmptyPage title="Not Found" />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
