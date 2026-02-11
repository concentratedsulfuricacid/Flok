import { useEffect, useMemo, useState } from "react";
import {
  exportDemoUserProfile,
  loadDemoUserProfile,
  resetDemoUserProfile,
  saveDemoUserProfile,
  type DemoUserProfile,
} from "../demo/demoUserStore";


function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<DemoUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        const p = await loadDemoUserProfile();
        setProfile(p);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const interestsText = useMemo(() => {
    if (!profile) return "";
    return profile.interests.join(", ");
  }, [profile]);

  const setInterestsFromText = (text: string) => {
    const list = text
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    // unique (case-insensitive)
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const i of list) {
      const key = i.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(i);
      }
    }

    setProfile((p) => (p ? { ...p, interests: unique } : p));
  };

  const onSave = () => {
    if (!profile) return;
    saveDemoUserProfile(profile);
    setMsg("Saved! Other pages can now read the updated demo profile.");
    setTimeout(() => setMsg(null), 2500);
  };

  const onReset = async () => {
    resetDemoUserProfile();
    setLoading(true);
    setMsg(null);
    try {
      const p = await loadDemoUserProfile(); // reload from seed into localStorage
      setProfile(p);
      setMsg("Reset to seeded demoUser.json");
      setTimeout(() => setMsg(null), 2500);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-[var(--color-muted)]">Loading profile…</div>;
  }

  if (!profile) {
    return (
      <div className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
        <div className="text-sm font-semibold text-[var(--color-danger)]">Profile unavailable</div>
        <div className="mt-2 text-sm text-[var(--color-muted)]">{msg ?? "Unknown error."}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">Profile</h1>
        <p className="mt-2 text-[var(--color-muted)]">
          Demo profile editor. Changes are saved to <span className="font-mono">localStorage</span>.
          You can export JSON if you want to replace the seed file manually.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Form */}
        <div className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--color-ink)]">Name</label>
              <input
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="flok-control rounded-2xl border px-4 py-3 text-sm outline-none focus:bg-white"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--color-ink)]">Age</label>
              <input
                type="number"
                min={1}
                value={profile.age}
                onChange={(e) =>
                  setProfile({ ...profile, age: clamp(Number(e.target.value), 1, 120) })
                }
                className="flok-control rounded-2xl border px-4 py-3 text-sm outline-none focus:bg-white"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--color-ink)]">Location</label>
              <input
                value={profile.location}
                onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                className="flok-control rounded-2xl border px-4 py-3 text-sm outline-none focus:bg-white"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--color-ink)]">
                Interests <span className="text-[var(--color-muted)]">(comma-separated)</span>
              </label>
              <input
                value={interestsText}
                onChange={(e) => setInterestsFromText(e.target.value)}
                className="flok-control rounded-2xl border px-4 py-3 text-sm outline-none focus:bg-white"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--color-ink)]">
                Fitness Level <span className="text-[var(--color-muted)]">(1–10)</span>
              </label>

              <input
                type="range"
                min={1}
                max={10}
                value={profile.fitnessLevel}
                onChange={(e) =>
                  setProfile({ ...profile, fitnessLevel: clamp(Number(e.target.value), 1, 10) })
                }
                className="w-full accent-[var(--color-accent)]"
              />
              <div className="text-sm text-[var(--color-muted)]">Current: {profile.fitnessLevel}/10</div>
            </div>

            {msg && (
              <div className="flok-success-card rounded-2xl p-3 text-sm">
                {msg}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={onSave}
                className="flok-button-primary rounded-2xl px-4 py-3 text-sm font-semibold"
              >
                Save Profile
              </button>

              <button
                type="button"
                onClick={() => exportDemoUserProfile(profile)}
                className="flok-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold"
              >
                Export JSON
              </button>

              <button
                type="button"
                onClick={onReset}
                className="flok-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold"
              >
                Reset to Seed
              </button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-[var(--color-ink)]">Current DemoUser (live)</div>
          <div className="mt-2 text-xs text-[var(--color-muted)]">
            This is what other pages should read from the store.
          </div>

          <pre className="mt-4 max-h-[520px] overflow-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-mist)]/45 p-4 text-xs text-[var(--color-ink)]">
{JSON.stringify(profile, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
