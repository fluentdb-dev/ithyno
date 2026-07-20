// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";
import { useStore, type ThemePreference } from "../store";

/**
 * Resolved theme actually applied to the DOM (`"light" | "dark"`), after
 * folding the user's tri-state preference (`"system" | "light" | "dark"`)
 * with the OS `prefers-color-scheme` media query.
 *
 * Sibling to the FOUC guard in `web/index.html` — both must resolve the
 * same way so the first paint and every subsequent render agree.
 *
 * Side effects:
 *   - Writes `document.documentElement.dataset.theme = "<applied>"` whenever
 *     the resolved value changes, which drives the CSS palette swap.
 *   - Subscribes to `matchMedia("(prefers-color-scheme: dark)")` when the
 *     preference is `"system"` so an OS-level swap flips the UI live.
 *
 * Returns the applied theme so consumers (e.g. Terminal.tsx) can read a
 * palette rebuild on change without touching the DOM themselves.
 */
export type AppliedTheme = "light" | "dark";

function resolveApplied(pref: ThemePreference): AppliedTheme {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useAppliedTheme(): AppliedTheme {
  const theme = useStore((s) => s.theme);
  const [applied, setApplied] = useState<AppliedTheme>(() => resolveApplied(theme));

  // Recompute + push to <html data-theme=…> whenever the preference changes.
  useEffect(() => {
    const next = resolveApplied(theme);
    setApplied(next);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = next;
    }
  }, [theme]);

  // Follow OS changes only when the user picked "system". Manual "light" /
  // "dark" is a hard override — we deliberately do not subscribe then.
  useEffect(() => {
    if (theme !== "system") return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mm = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      const next: AppliedTheme = e.matches ? "dark" : "light";
      setApplied(next);
      document.documentElement.dataset.theme = next;
    };
    // addEventListener is the modern API; addListener is the Safari <14
    // fallback. Feature-detect so we don't crash on very old browsers.
    if (typeof mm.addEventListener === "function") {
      mm.addEventListener("change", onChange);
      return () => mm.removeEventListener("change", onChange);
    }
    // Legacy Safari <14 path. Cast avoids the deprecated overload
    // showing up in the modern lib.dom types.
    const legacy = mm as unknown as {
      addListener: (cb: (e: MediaQueryListEvent) => void) => void;
      removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
    };
    legacy.addListener(onChange);
    return () => {
      legacy.removeListener(onChange);
    };
  }, [theme]);

  return applied;
}
