// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from "react";
import { useStore, type ThemePreference } from "../store";

/**
 * Tri-state segmented control for the theme preference
 * (`system` / `light` / `dark`). Reads and writes the store slice, which
 * persists to `localStorage["ithyno.theme"]`. The store's setter is the
 * only writer; useAppliedTheme() subscribes and updates
 * `<html data-theme=…>` on change.
 *
 * Mount lives in Settings (not the header) per the change proposal's
 * design decision — the toggle is a preference, not a frequent action.
 * Landed by add-light-dark-mode.
 */
export function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  const options: { value: ThemePreference; label: string; icon: ReactNode; hint: string }[] = [
    { value: "system", label: "Auto", icon: <AutoIcon />, hint: "Follow OS preference" },
    { value: "light", label: "Light", icon: <SunIcon />, hint: "Force light palette" },
    { value: "dark", label: "Dark", icon: <MoonIcon />, hint: "Force dark palette" },
  ];

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Color theme">
      {options.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`theme-toggle-btn${active ? " active" : ""}`}
            role="radio"
            aria-checked={active}
            title={opt.hint}
            onClick={() => setTheme(opt.value)}
          >
            <span className="theme-toggle-icon" aria-hidden="true">
              {opt.icon}
            </span>
            <span className="theme-toggle-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AutoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}
