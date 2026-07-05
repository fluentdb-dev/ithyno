// SPDX-License-Identifier: GPL-3.0-or-later
// Runtime bootstrap: session token + (future) VS Code webview detection.
//
// The server prints a launch URL with `?token=<token>`. We read it once,
// stash it in sessionStorage, and call history.replaceState to drop the token
// from the visible address bar so it doesn't linger in screenshots / history.

const STORAGE_KEY = "ithyno.sessionToken";

function bootstrapToken(): string | null {
  // Only run in browser (vitest in node would fail otherwise).
  if (typeof window === "undefined") return null;

  // 1. URL takes precedence — it's how a fresh launch installs the token.
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("token");
    if (fromUrl) {
      sessionStorage.setItem(STORAGE_KEY, fromUrl);
      url.searchParams.delete("token");
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "") + url.hash,
      );
      return fromUrl;
    }
  } catch {
    /* malformed URL — fall through */
  }

  // 2. Otherwise reuse what we already stashed.
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let cachedToken: string | null = bootstrapToken();

export function getSessionToken(): string | null {
  return cachedToken;
}

/** For session-expired recovery: drop the stored token so the next bootstrap
 *  forces the user back through the launch URL. */
export function clearSessionToken(): void {
  cachedToken = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
