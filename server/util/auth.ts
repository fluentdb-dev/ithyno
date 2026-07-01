import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Per-process session token + Origin allow-list + content-type enforcement.
 *
 * The token is generated once at module load, lives in memory, and is
 * required for every mutating endpoint (POST/PATCH/PUT/DELETE) and every
 * WebSocket upgrade. A new server process means a new token; stale browser
 * tabs from a previous run lose access until they reload from the freshly
 * printed launch URL.
 */

export const SESSION_TOKEN = randomBytes(32).toString("hex");

/** Constant-time comparison; returns false for any mismatch including length. */
export function verifyToken(supplied: string | undefined | null): boolean {
  if (!supplied || typeof supplied !== "string") return false;
  if (supplied.length !== SESSION_TOKEN.length) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(SESSION_TOKEN);
  // timingSafeEqual requires equal lengths (we verified above).
  return timingSafeEqual(a, b);
}

export type OriginAllowList = {
  exact: Set<string>;
  prefixes: string[];
};

/**
 * Build the allow-list at server boot once the listening port is known. The
 * optional `extra` parameter takes additional origin strings — used in dev
 * mode to include the Vite UI server's port (which differs from the Fastify
 * port) and in future shells that load content from a non-localhost scheme.
 */
export function buildOriginAllowList(port: number, extra: string[] = []): OriginAllowList {
  return {
    exact: new Set([
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
      `http://[::1]:${port}`,
      ...extra,
    ]),
    // VS Code webviews carry a per-session id we cannot pre-compute.
    prefixes: ["vscode-webview://"],
  };
}

/**
 * Return true when the Origin is allowed.
 * - undefined / empty Origin → allowed at the Origin layer; token check must
 *   succeed independently (CLI / curl path).
 * - present Origin → must match the allow-list exactly (or via a known
 *   prefix); browsers cannot spoof Origin on cross-origin fetches, so this
 *   reliably blocks malicious page → localhost CSRF.
 */
export function isOriginAllowed(origin: string | undefined, allow: OriginAllowList): boolean {
  if (!origin) return true;
  if (allow.exact.has(origin)) return true;
  for (const p of allow.prefixes) if (origin.startsWith(p)) return true;
  return false;
}

/**
 * Pull the token from the standard header or, as a fallback for WebSocket
 * upgrades and ad-hoc clients, the `?token=` query.
 */
export function extractToken(req: {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
}): string | null {
  const header = req.headers["x-session-token"];
  if (typeof header === "string" && header.length > 0) return header;
  if (Array.isArray(header) && header[0]) return header[0];
  if (req.url) {
    const qIndex = req.url.indexOf("?");
    if (qIndex >= 0) {
      const params = new URLSearchParams(req.url.slice(qIndex + 1));
      const t = params.get("token");
      if (t) return t;
    }
  }
  return null;
}

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export type AuthFailure =
  | { ok: false; status: 401; error: "auth required" }
  | { ok: false; status: 403; error: "auth invalid" | "origin not allowed" }
  | { ok: false; status: 415; error: "content-type must be application/json" };

/**
 * Apply the three-layer check to a mutating HTTP request. Read-only methods
 * pass through automatically; callers can use the `method` field of the
 * request to gate.
 */
export function checkAuthHttp(req: {
  method: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}, allow: OriginAllowList): { ok: true } | AuthFailure {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) return { ok: true };

  const origin = (req.headers.origin as string) || "";
  if (!isOriginAllowed(origin || undefined, allow)) {
    return { ok: false, status: 403, error: "origin not allowed" };
  }

  const ct = (req.headers["content-type"] as string) || "";
  // Mutating routes that legitimately accept a body must use JSON.
  if (ct && !ct.toLowerCase().startsWith("application/json")) {
    return { ok: false, status: 415, error: "content-type must be application/json" };
  }

  const token = extractToken(req);
  if (!token) return { ok: false, status: 401, error: "auth required" };
  if (!verifyToken(token)) return { ok: false, status: 403, error: "auth invalid" };

  return { ok: true };
}

/** Variant used by the WS upgrade handler — token may live in the query only. */
export function checkAuthWs(
  req: { url?: string; headers: Record<string, string | string[] | undefined> },
  allow: OriginAllowList,
): { ok: true } | AuthFailure {
  const origin = (req.headers.origin as string) || "";
  if (!isOriginAllowed(origin || undefined, allow)) {
    return { ok: false, status: 403, error: "origin not allowed" };
  }
  const token = extractToken(req);
  if (!token) return { ok: false, status: 401, error: "auth required" };
  if (!verifyToken(token)) return { ok: false, status: 403, error: "auth invalid" };
  return { ok: true };
}
