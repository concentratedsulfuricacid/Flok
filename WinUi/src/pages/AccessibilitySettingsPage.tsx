type LargeTextOverride = boolean | null;

type AccessibilitySettingsPageProps = {
  largeTextEnabled: boolean;
  largeTextAutoEnabled: boolean;
  largeTextOverride: LargeTextOverride;
  highContrastEnabled: boolean;
  dyslexiaFontEnabled: boolean;
  onToggleLargeText: () => void;
  onResetLargeTextAuto: () => void;
  onToggleHighContrast: () => void;
  onToggleDyslexiaFont: () => void;
};

function ToggleRow({
  title,
  description,
  enabled,
  onToggle,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-[var(--color-ink)]">{title}</div>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={enabled}
          className={
            "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
            (enabled
              ? "bg-[var(--color-accent)] text-white"
              : "border border-[var(--color-border)] bg-white text-[var(--color-muted)]")
          }
        >
          {enabled ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}

export default function AccessibilitySettingsPage({
  largeTextEnabled,
  largeTextAutoEnabled,
  largeTextOverride,
  highContrastEnabled,
  dyslexiaFontEnabled,
  onToggleLargeText,
  onResetLargeTextAuto,
  onToggleHighContrast,
  onToggleDyslexiaFont,
}: AccessibilitySettingsPageProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[var(--color-ink)] [font-family:var(--font-display)]">
          Accessibility Settings
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Personalize text, contrast, and readability across the entire app.
        </p>
      </section>

      <section className="space-y-3">
        <ToggleRow
          title="Large Text"
          description="Increases text scale for readability without zooming the full layout."
          enabled={largeTextEnabled}
          onToggle={onToggleLargeText}
        />
        {largeTextAutoEnabled && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-mist)]/60 px-4 py-3 text-xs text-[var(--color-muted)]">
            Large Text is currently auto-enabled from profile age.
            {largeTextOverride !== null ? " Manual override is active." : ""}
          </div>
        )}
        {largeTextOverride !== null && (
          <button
            type="button"
            onClick={onResetLargeTextAuto}
            className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-[var(--color-mist)]/50 hover:text-[var(--color-ink)]"
          >
            Use Auto Text Size
          </button>
        )}
        <ToggleRow
          title="High Contrast"
          description="Switches to an AA-safe contrast palette for text, controls, chips, and badges."
          enabled={highContrastEnabled}
          onToggle={onToggleHighContrast}
        />
        <ToggleRow
          title="Dyslexia-Friendly Font"
          description="Uses OpenDyslexic with readability spacing adjustments."
          enabled={dyslexiaFontEnabled}
          onToggle={onToggleDyslexiaFont}
        />
      </section>

      <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Contrast Tokens (WCAG AA)</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          These semantic tokens now back muted text, chips, badges, and feedback states.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--color-border)] p-3 text-sm text-[var(--color-muted)]">
            `--color-muted` on `--color-surface` ≈ 7.5:1
          </div>
          <div className="rounded-xl border border-[var(--color-border)] p-3 text-sm text-[var(--color-muted)]">
            `--color-accent` on `--color-surface` ≈ 6.4:1
          </div>
          <div className="rounded-xl border border-[var(--color-border)] p-3 text-sm text-[var(--color-muted)]">
            Chip text/background ≈ 8.2:1
          </div>
          <div className="rounded-xl border border-[var(--color-border)] p-3 text-sm text-[var(--color-muted)]">
            Badge text/background ≈ 7.0:1
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="flok-chip rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            Sample chip
          </span>
          <span className="flok-badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            Sample badge
          </span>
          <span className="flok-text-muted text-sm">Muted helper text sample</span>
        </div>
      </section>
    </div>
  );
}
