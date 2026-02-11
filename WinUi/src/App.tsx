import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes, Navigate } from "react-router-dom";
import {
  Menu,
  X,
  MapPin,
  CalendarDays,
  Users,
  PlusCircle,
  User,
  Accessibility,
} from "lucide-react";

import MapPage from "./pages/MapPage";
import EventsPage from "./pages/EventsPage";
import FriendsPage from "./pages/FriendsPage";
import CreateEventPage from "./pages/CreateEventPage";
import ProfilePage from "./pages/ProfilePage";
import { loadDemoUserProfile } from "./demo/demoUserStore";

const A11Y_LARGE_TEXT_KEY = "flok.a11y.largeTextOverride.v1";
const A11Y_HIGH_CONTRAST_KEY = "flok.a11y.highContrast.v1";
const A11Y_DYSLEXIA_FONT_KEY = "flok.a11y.dyslexiaFont.v1";
const A11Y_LARGE_TEXT_AGE_THRESHOLD = 60;

const NAV_ITEMS = [
  { label: "Map", to: "/map", Icon: MapPin },
  { label: "Events", to: "/events", Icon: CalendarDays },
  { label: "Friends", to: "/friends", Icon: Users },
  { label: "Create Event", to: "/create-event", Icon: PlusCircle },
  { label: "Profile", to: "/profile", Icon: User },
];

type LargeTextOverride = boolean | null;

function readA11ySetting(key: string): LargeTextOverride {
  try {
    const value = localStorage.getItem(key);
    if (value === "on") return true;
    if (value === "off") return false;
    return null;
  } catch {
    return null;
  }
}

function writeA11ySetting(key: string, value: LargeTextOverride) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, value ? "on" : "off");
  } catch {
    // Ignore storage errors (private mode / quota).
  }
}

function Shell({
  children,
  largeTextEnabled,
  largeTextAutoEnabled,
  largeTextOverride,
  highContrastEnabled,
  dyslexiaFontEnabled,
  onToggleLargeText,
  onResetLargeTextAuto,
  onToggleHighContrast,
  onToggleDyslexiaFont,
}: {
  children: React.ReactNode;
  largeTextEnabled: boolean;
  largeTextAutoEnabled: boolean;
  largeTextOverride: LargeTextOverride;
  highContrastEnabled: boolean;
  dyslexiaFontEnabled: boolean;
  onToggleLargeText: () => void;
  onResetLargeTextAuto: () => void;
  onToggleHighContrast: () => void;
  onToggleDyslexiaFont: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [a11yOpen, setA11yOpen] = useState(false);
  const a11yRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!a11yRef.current) return;
      if (!a11yRef.current.contains(event.target as Node)) {
        setA11yOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setA11yOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--color-ink)] focus:shadow"
      >
        Skip to main content
      </a>

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
              <div className="relative" ref={a11yRef}>
                <button
                  type="button"
                  onClick={() => setA11yOpen((prev) => !prev)}
                  aria-expanded={a11yOpen}
                  aria-controls="a11y-menu"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--color-muted)] ring-1 ring-white/70 transition hover:bg-[var(--color-mist)]"
                >
                  <Accessibility className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Accessibility</span>
                </button>
                {a11yOpen && (
                  <div
                    id="a11y-menu"
                    className="absolute right-0 top-10 z-[70] w-72 rounded-2xl border border-white/70 bg-white p-3 shadow-xl"
                  >
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      Accessibility
                    </div>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={onToggleLargeText}
                        aria-pressed={largeTextEnabled}
                        className="flex w-full items-center justify-between rounded-xl border border-[var(--color-mist)] px-3 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-mist)]/40"
                      >
                        <span>Large Text</span>
                        <span className="text-xs font-semibold text-[var(--color-muted)]">
                          {largeTextEnabled ? "On" : "Off"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={onToggleHighContrast}
                        aria-pressed={highContrastEnabled}
                        className="flex w-full items-center justify-between rounded-xl border border-[var(--color-mist)] px-3 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-mist)]/40"
                      >
                        <span>High Contrast</span>
                        <span className="text-xs font-semibold text-[var(--color-muted)]">
                          {highContrastEnabled ? "On" : "Off"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={onToggleDyslexiaFont}
                        aria-pressed={dyslexiaFontEnabled}
                        className="flex w-full items-center justify-between rounded-xl border border-[var(--color-mist)] px-3 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-mist)]/40"
                      >
                        <span>Dyslexia Font</span>
                        <span className="text-xs font-semibold text-[var(--color-muted)]">
                          {dyslexiaFontEnabled ? "On" : "Off"}
                        </span>
                      </button>
                    </div>
                    <div className="mt-3 border-t border-[var(--color-mist)] pt-2 text-xs text-[var(--color-muted)]">
                      {largeTextAutoEnabled && largeTextOverride === null
                        ? "Large Text is auto-enabled by profile age."
                        : "Large Text uses manual setting."}
                    </div>
                    {largeTextOverride !== null && (
                      <button
                        type="button"
                        onClick={onResetLargeTextAuto}
                        className="mt-2 w-full rounded-xl border border-[var(--color-mist)] px-3 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-mist)]/40"
                      >
                        Use Auto Text
                      </button>
                    )}
                  </div>
                )}
              </div>
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
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-10">{children}</main>

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
  const [largeTextOverride, setLargeTextOverride] = useState<LargeTextOverride>(() =>
    readA11ySetting(A11Y_LARGE_TEXT_KEY)
  );
  const [highContrastOverride, setHighContrastOverride] = useState<LargeTextOverride>(() =>
    readA11ySetting(A11Y_HIGH_CONTRAST_KEY)
  );
  const [dyslexiaFontOverride, setDyslexiaFontOverride] = useState<LargeTextOverride>(() =>
    readA11ySetting(A11Y_DYSLEXIA_FONT_KEY)
  );
  const [profileAge, setProfileAge] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const refreshProfileAge = async () => {
      try {
        const profile = await loadDemoUserProfile();
        if (!active) return;
        setProfileAge(profile.age);
      } catch {
        if (!active) return;
        setProfileAge(null);
      }
    };

    void refreshProfileAge();
    const onProfileUpdated = () => {
      void refreshProfileAge();
    };
    window.addEventListener("flok-demo-profile-updated", onProfileUpdated);

    return () => {
      active = false;
      window.removeEventListener("flok-demo-profile-updated", onProfileUpdated);
    };
  }, []);

  const largeTextAutoEnabled =
    profileAge !== null && profileAge >= A11Y_LARGE_TEXT_AGE_THRESHOLD;
  const largeTextEnabled = largeTextOverride ?? largeTextAutoEnabled;
  const highContrastEnabled = highContrastOverride ?? false;
  const dyslexiaFontEnabled = dyslexiaFontOverride ?? false;

  useEffect(() => {
    document.documentElement.classList.toggle("a11y-large-text", largeTextEnabled);
    document.documentElement.classList.toggle("a11y-high-contrast", highContrastEnabled);
    document.documentElement.classList.toggle("a11y-dyslexia-font", dyslexiaFontEnabled);
    return () => {
      document.documentElement.classList.remove("a11y-large-text");
      document.documentElement.classList.remove("a11y-high-contrast");
      document.documentElement.classList.remove("a11y-dyslexia-font");
    };
  }, [largeTextEnabled, highContrastEnabled, dyslexiaFontEnabled]);

  const toggleLargeText = () => {
    const next = !largeTextEnabled;
    setLargeTextOverride(next);
    writeA11ySetting(A11Y_LARGE_TEXT_KEY, next);
  };

  const resetLargeTextAuto = () => {
    setLargeTextOverride(null);
    writeA11ySetting(A11Y_LARGE_TEXT_KEY, null);
  };

  const toggleHighContrast = () => {
    const next = !highContrastEnabled;
    setHighContrastOverride(next);
    writeA11ySetting(A11Y_HIGH_CONTRAST_KEY, next);
  };

  const toggleDyslexiaFont = () => {
    const next = !dyslexiaFontEnabled;
    setDyslexiaFontOverride(next);
    writeA11ySetting(A11Y_DYSLEXIA_FONT_KEY, next);
  };

  return (
    <BrowserRouter>
      <Shell
        largeTextEnabled={largeTextEnabled}
        largeTextAutoEnabled={largeTextAutoEnabled}
        largeTextOverride={largeTextOverride}
        highContrastEnabled={highContrastEnabled}
        dyslexiaFontEnabled={dyslexiaFontEnabled}
        onToggleLargeText={toggleLargeText}
        onResetLargeTextAuto={resetLargeTextAuto}
        onToggleHighContrast={toggleHighContrast}
        onToggleDyslexiaFont={toggleDyslexiaFont}
      >
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
