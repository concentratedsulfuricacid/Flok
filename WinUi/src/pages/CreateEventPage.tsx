import React, { useEffect, useMemo, useState } from "react";
import { loadDemoUserProfile } from "../demo/demoUserStore";
import type { DemoUserProfile } from "../demo/demoUserStore";

type Event = {
  description: string;
  creator: string;
  dateTime: string; // ISO string
  participants: string[]; // kept for backend shape (we'll implement later)
  capacity: number;
  isFull: boolean;
  location: string;
  tags: string[];
  imageUrl?: string;
};

/**
 * TODO (backend): implement POST /api/events
 * Body: Event
 */
export async function createEvent(event: Event): Promise<{ id?: string }> {
  const res = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  if (!res.ok) throw new Error(`Failed to create event: ${res.status}`);

  try {
    return (await res.json()) as { id?: string };
  } catch {
    return {};
  }
}

export default function CreateEventPage() {
  const [demoUser, setDemoUser] = useState<DemoUserProfile | null>(null);

  // Load demo user once
  useEffect(() => {
    (async () => {
      const p = await loadDemoUserProfile();
      setDemoUser(p);
    })();
  }, []);

  // Form state (start empty; seed once demoUser loads)
  const [description, setDescription] = useState("");
  const [dateTimeLocal, setDateTimeLocal] = useState(""); // datetime-local string
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState<number>(10);

  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

  // Seed defaults once profile is available
  useEffect(() => {
    if (!demoUser) return;
    setLocation(demoUser.location);
    setTags(demoUser.interests);
  }, [demoUser]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<Event | null>(null);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;

    setTags((prev) => {
      const key = t.toLowerCase();
      if (prev.some((x) => x.toLowerCase() === key)) return prev;
      return [...prev, t];
    });

    setTagInput("");
  };

  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const onImageSelected = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Please select an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === "string" ? reader.result : "";
      if (!data) {
        setFormError("Failed to read selected image.");
        return;
      }
      setImageUrl(data);
    };
    reader.onerror = () => setFormError("Failed to read selected image.");
    reader.readAsDataURL(file);
  };

  const validate = (): string | null => {
    if (!description.trim()) return "Description is required.";
    if (!dateTimeLocal) return "Date & time is required.";
    if (!location.trim()) return "Location is required.";
    if (!Number.isFinite(capacity) || capacity < 1) return "Capacity must be at least 1.";
    if (!demoUser) return "Profile not loaded yet.";
    return null;
  };

  // Participants UI removed for now
  const participants: string[] = [];

  const payload: Event | null = useMemo(() => {
    if (!demoUser) return null;
    if (!dateTimeLocal) return null;

    const iso = new Date(dateTimeLocal).toISOString();
    const safeCapacity = Math.max(1, capacity);
    const isFull = participants.length >= safeCapacity;

    return {
      description: description.trim(),
      creator: demoUser.name,
      dateTime: iso,
      participants,
      capacity: safeCapacity,
      isFull,
      location: location.trim(),
      tags,
      imageUrl,
    };
  }, [demoUser, description, dateTimeLocal, participants, capacity, location, tags, imageUrl]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreated(null);

    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    if (!payload) return;

    setSubmitting(true);
    try {
      await createEvent(payload);
      setCreated(payload);

      // Reset (keep seeded defaults for demo user)
      setDescription("");
      setDateTimeLocal("");
      setCapacity(10);
      setTagInput("");
      setImageUrl(undefined);
      if (demoUser) {
        setLocation(demoUser.location);
        setTags(demoUser.interests);
      } else {
        setLocation("");
        setTags([]);
      }
    } catch (ex) {
      setFormError(ex instanceof Error ? ex.message : "Failed to create event.");
    } finally {
      setSubmitting(false);
    }
  };

  // IMPORTANT: render guard AFTER hooks
  if (!demoUser) {
    return <div className="text-[var(--color-muted)]">Loading profile…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">Create Event</h1>
        <p className="mt-2 text-[var(--color-muted)]">
          Demo form. We’ll wire the backend later. Creator defaults to{" "}
          <span className="font-semibold">{demoUser.name}</span>.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Form */}
        <form onSubmit={onSubmit} className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-[var(--color-ink)]">Event Details</div>

          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--color-ink)]">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Gentle yoga session for seniors"
                className="flok-control min-h-[90px] rounded-2xl border px-4 py-3 text-sm outline-none focus:bg-white"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--color-ink)]">Creator</label>
              <input
                value={demoUser.name}
                readOnly
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-mist)]/40 px-4 py-3 text-sm text-[var(--color-muted)]"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--color-ink)]">Date & Time</label>
              <input
                type="datetime-local"
                value={dateTimeLocal}
                onChange={(e) => setDateTimeLocal(e.target.value)}
                className="flok-control rounded-2xl border px-4 py-3 text-sm outline-none focus:bg-white"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--color-ink)]">Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Pasir Ris Park"
                className="flok-control rounded-2xl border px-4 py-3 text-sm outline-none focus:bg-white"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--color-ink)]">Capacity</label>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="flok-control rounded-2xl border px-4 py-3 text-sm outline-none focus:bg-white"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--color-ink)]">Event Image (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onImageSelected(e.target.files?.[0] ?? null)}
                className="flok-control rounded-2xl border px-4 py-3 text-sm outline-none file:mr-3 file:rounded-xl file:border-0 file:bg-[var(--color-accent)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white focus:bg-white"
              />
              {imageUrl && (
                <div className="space-y-2">
                  <img src={imageUrl} alt="Event preview" className="h-40 w-full rounded-2xl object-cover" />
                  <button
                    type="button"
                    onClick={() => setImageUrl(undefined)}
                    className="flok-button-secondary rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    Remove image
                  </button>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--color-ink)]">Tags</label>

              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="e.g. yoga"
                  className="flok-control flex-1 rounded-2xl border px-4 py-3 text-sm outline-none focus:bg-white"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="flok-button-primary rounded-2xl px-4 py-3 text-sm font-semibold"
                >
                  Add
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <span key={t} className="flok-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold">
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="text-[var(--color-chip-text)] hover:text-[var(--color-accent-strong)]"
                      aria-label={`Remove tag ${t}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {formError && (
              <div className="flok-error-card rounded-2xl p-3 text-sm">
                {formError}
                <div className="mt-1 text-xs text-[var(--color-danger)]">
                  Expected endpoint: <span className="font-mono">POST /api/events</span>
                </div>
              </div>
            )}

            {created && (
              <div className="flok-success-card rounded-2xl p-3 text-sm">
                Event created (demo)!
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flok-button-primary rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create Event"}
            </button>
          </div>
        </form>

        {/* Preview */}
        <div className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-[var(--color-ink)]">Payload Preview</div>
          <div className="mt-2 text-xs text-[var(--color-muted)]">This is what we’ll POST to the backend.</div>

          <pre className="mt-4 max-h-[520px] overflow-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-mist)]/45 p-4 text-xs text-[var(--color-ink)]">
{JSON.stringify(payload ?? { note: "Fill in the form to see payload" }, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
