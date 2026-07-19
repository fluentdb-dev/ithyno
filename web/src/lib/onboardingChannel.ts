// SPDX-License-Identifier: GPL-3.0-or-later
// Channel-aware Close / Open Project handlers for the onboarding page.
// Detects Electron / VS Code / browser via `window` shape (with an
// optional `?channel=` query override). Kept dependency-free so the
// onboarding page renders even before the shell decides what channel
// it's in.

export type OnboardingChannel = "electron" | "browser" | "vscode";

interface ElectronOnboardingBridge {
  onboardingOpen: (target: string) => void;
  onboardingClose: () => void;
}

interface VsCodeApi {
  postMessage(msg: unknown): void;
}

declare global {
  interface Window {
    ithynoOnboarding?: ElectronOnboardingBridge;
    // `acquireVsCodeApi` is declared elsewhere (VS Code webview types)
    // as `() => unknown`. We narrow to `VsCodeApi` at the call site.
  }
}

/**
 * Pick a channel. Priority:
 *   1. explicit `?channel=` query param
 *   2. runtime detection (window shape)
 *   3. fallback: browser
 */
export function detectChannel(): OnboardingChannel {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("channel");
  if (q === "electron" || q === "browser" || q === "vscode") return q;
  if (typeof window.ithynoOnboarding === "object" && window.ithynoOnboarding) {
    return "electron";
  }
  if (typeof window.acquireVsCodeApi === "function") return "vscode";
  return "browser";
}

/**
 * Fire the channel-specific "Close" behavior. Falls back to
 * `history.back()` when the page has a history stack, else navigates
 * to `/`.
 */
export function closeOnboarding(channel: OnboardingChannel): void {
  if (channel === "electron" && window.ithynoOnboarding) {
    window.ithynoOnboarding.onboardingClose();
    return;
  }
  if (channel === "vscode" && typeof window.acquireVsCodeApi === "function") {
    try {
      const vscode = window.acquireVsCodeApi() as VsCodeApi;
      vscode.postMessage({ type: "onboarding-close" });
      return;
    } catch {
      /* fall through */
    }
  }
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = "/";
  }
}

/**
 * Fire the channel-specific "Open Project" behavior. The target is
 * an absolute path.
 */
export function openProject(channel: OnboardingChannel, target: string): void {
  if (channel === "electron" && window.ithynoOnboarding) {
    window.ithynoOnboarding.onboardingOpen(target);
    return;
  }
  if (channel === "vscode" && typeof window.acquireVsCodeApi === "function") {
    try {
      const vscode = window.acquireVsCodeApi() as VsCodeApi;
      vscode.postMessage({ type: "onboarding-open", target });
      return;
    } catch {
      /* fall through */
    }
  }
  // Browser fallback: navigate to root with ?dir=<target>. The server
  // is expected to pick up the new PROJECT_ROOT on a fresh page load.
  const encoded = encodeURIComponent(target);
  window.location.href = `/?dir=${encoded}`;
}
