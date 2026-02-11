# Accessibility

Flok ships a small set of accessibility features that apply across the UI via semantic tokens, global CSS classes, and ARIA attributes.

## User-facing settings
Open `http://127.0.0.1:5173/accessibility-settings` in the WinUi.

- **Large Text**: increases text scale without zooming the entire layout.
  - Auto-enables when demo profile age ≥ 60 (manual override supported).
- **High Contrast**: switches to a high-contrast palette for text, controls, chips, and badges.
- **Dyslexia-friendly font**: uses OpenDyslexic plus spacing adjustments.

## Keyboard + focus
- “Skip to main content” link at the top of the UI.
- Visible `:focus-visible` rings (with a stronger variant in high-contrast mode).

## Screen reader support
- Toggles expose `aria-pressed`.
- Dialogs use `aria-modal` + `aria-label`.
- Toast-style status messages announce via `aria-live="polite"`.

## Implementation pointers
- Route + state + localStorage: `WinUi/src/App.tsx`
- Settings UI: `WinUi/src/pages/AccessibilitySettingsPage.tsx`
- Global theme classes + contrast tokens + focus styles: `WinUi/src/index.css`

