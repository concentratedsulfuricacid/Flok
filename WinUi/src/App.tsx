import React, { useMemo, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes, Navigate } from "react-router-dom";
import {
  Menu,
  X,
  MapPin,
  CalendarDays,
  Users,
  PlusCircle,
  User,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Map", to: "/map", Icon: MapPin },
  { label: "Nearby Events", to: "/nearby-events", Icon: CalendarDays },
  { label: "Friends", to: "/friends", Icon: Users },
  { label: "Create Event", to: "/create-event", Icon: PlusCircle },
  { label: "Profile", to: "/profile", Icon: User },
];

function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const Brand = useMemo(
    () => (
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-400 shadow-sm ring-1 ring-rose-200">
          <span className="text-base font-extrabold tracking-tight text-white">F</span>
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-extrabold tracking-tight text-neutral-900">
            Flok
          </div>
          <div className="text-xs text-neutral-500">Find your communities</div>
        </div>
      </div>
    ),
    []
  );

  const tabBase =
    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition";
  const tabActive =
    "bg-rose-50 text-rose-700 ring-1 ring-rose-200 shadow-sm";
  const tabInactive =
    "text-neutral-600 hover:bg-rose-50 hover:text-rose-700";

  return (
    <div className="min-h-screen bg-rose-50 text-neutral-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-rose-200 bg-white/80 backdrop-blur">
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
              <span className="hidden sm:inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                Prototype
              </span>

              <button
                className="md:hidden inline-flex items-center justify-center rounded-xl p-2 ring-1 ring-rose-200 hover:bg-rose-50"
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
                          ? "bg-rose-50 text-rose-700 ring-rose-200"
                          : "bg-white text-neutral-700 ring-rose-100 hover:bg-rose-50 hover:ring-rose-200",
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
      <footer className="border-t border-rose-200 bg-white/60">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-neutral-500">
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
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          {title}
        </h1>
        <p className="mt-2 text-neutral-600">
          This page is intentionally empty for now. We’ll add components here later.
        </p>
      </div>

      <div className="rounded-3xl border border-rose-200 bg-white p-10 shadow-sm">
        <div className="text-neutral-500">{title} content goes here…</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          {/* Default route */}
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
