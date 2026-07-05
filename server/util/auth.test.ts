// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import {
  SESSION_TOKEN,
  verifyToken,
  buildOriginAllowList,
  isOriginAllowed,
  extractToken,
  checkAuthHttp,
  checkAuthWs,
} from "./auth.js";

describe("verifyToken", () => {
  it("returns true for the real token", () => {
    expect(verifyToken(SESSION_TOKEN)).toBe(true);
  });
  it("returns false for empty / nullish", () => {
    expect(verifyToken("")).toBe(false);
    expect(verifyToken(undefined)).toBe(false);
    expect(verifyToken(null)).toBe(false);
  });
  it("returns false for a length-mismatched token", () => {
    expect(verifyToken("a".repeat(SESSION_TOKEN.length - 1))).toBe(false);
    expect(verifyToken("a".repeat(SESSION_TOKEN.length + 1))).toBe(false);
  });
  it("returns false for a same-length wrong token", () => {
    expect(verifyToken("z".repeat(SESSION_TOKEN.length))).toBe(false);
  });
});

describe("buildOriginAllowList + isOriginAllowed", () => {
  const allow = buildOriginAllowList(4321);

  it("accepts the literal localhost variants", () => {
    expect(isOriginAllowed("http://localhost:4321", allow)).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:4321", allow)).toBe(true);
    expect(isOriginAllowed("http://[::1]:4321", allow)).toBe(true);
  });
  it("rejects a different port", () => {
    expect(isOriginAllowed("http://localhost:9999", allow)).toBe(false);
  });
  it("rejects unrelated hosts", () => {
    expect(isOriginAllowed("https://evil.example.com", allow)).toBe(false);
  });
  it("accepts vscode-webview:// by prefix", () => {
    expect(isOriginAllowed("vscode-webview://abc-def-ghi", allow)).toBe(true);
    expect(isOriginAllowed("vscode-webview://", allow)).toBe(true);
  });
  it("accepts extra origins (dev mode Vite UI port)", () => {
    const withDev = buildOriginAllowList(4321, ["http://localhost:5173"]);
    expect(isOriginAllowed("http://localhost:5173", withDev)).toBe(true);
    expect(isOriginAllowed("http://localhost:5173", allow)).toBe(false);
  });
  it("admits an absent Origin (token check covers this case)", () => {
    expect(isOriginAllowed(undefined, allow)).toBe(true);
    expect(isOriginAllowed("", allow)).toBe(true);
  });
});

describe("extractToken", () => {
  it("reads X-Session-Token header", () => {
    expect(extractToken({ headers: { "x-session-token": "abc" } })).toBe("abc");
  });
  it("reads ?token= from the URL", () => {
    expect(extractToken({ headers: {}, url: "/api/x?token=abc&other=1" })).toBe("abc");
  });
  it("returns null when neither is present", () => {
    expect(extractToken({ headers: {} })).toBeNull();
    expect(extractToken({ headers: {}, url: "/api/x?other=1" })).toBeNull();
  });
});

describe("checkAuthHttp", () => {
  const allow = buildOriginAllowList(4321);

  it("passes a GET unchanged", () => {
    expect(checkAuthHttp({ method: "GET", url: "/", headers: {} }, allow)).toEqual({ ok: true });
  });

  it("rejects a POST with no token (401)", () => {
    const r = checkAuthHttp(
      { method: "POST", url: "/api/x", headers: { "content-type": "application/json" } },
      allow,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("rejects a POST with a wrong token (403)", () => {
    const r = checkAuthHttp(
      {
        method: "POST",
        url: "/api/x",
        headers: {
          "content-type": "application/json",
          "x-session-token": "wrong",
        },
      },
      allow,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("rejects a wrong-origin POST (403) even with a valid token", () => {
    const r = checkAuthHttp(
      {
        method: "POST",
        url: "/api/x",
        headers: {
          origin: "https://evil.example.com",
          "content-type": "application/json",
          "x-session-token": SESSION_TOKEN,
        },
      },
      allow,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("origin not allowed");
  });

  it("rejects a wrong content-type POST (415)", () => {
    const r = checkAuthHttp(
      {
        method: "POST",
        url: "/api/x",
        headers: {
          origin: "http://localhost:4321",
          "content-type": "text/plain",
          "x-session-token": SESSION_TOKEN,
        },
      },
      allow,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(415);
  });

  it("accepts a fully-valid POST", () => {
    const r = checkAuthHttp(
      {
        method: "POST",
        url: "/api/x",
        headers: {
          origin: "http://localhost:4321",
          "content-type": "application/json",
          "x-session-token": SESSION_TOKEN,
        },
      },
      allow,
    );
    expect(r.ok).toBe(true);
  });

  it("admits a missing Origin (CLI / curl path) with a valid token", () => {
    const r = checkAuthHttp(
      {
        method: "POST",
        url: "/api/x",
        headers: {
          "content-type": "application/json",
          "x-session-token": SESSION_TOKEN,
        },
      },
      allow,
    );
    expect(r.ok).toBe(true);
  });
});

describe("checkAuthWs", () => {
  const allow = buildOriginAllowList(4321);

  it("accepts a valid upgrade", () => {
    expect(
      checkAuthWs(
        {
          url: `/ws?token=${SESSION_TOKEN}`,
          headers: { origin: "http://localhost:4321" },
        },
        allow,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects a token-less upgrade", () => {
    const r = checkAuthWs(
      { url: "/ws", headers: { origin: "http://localhost:4321" } },
      allow,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("rejects a wrong-origin upgrade", () => {
    const r = checkAuthWs(
      {
        url: `/ws?token=${SESSION_TOKEN}`,
        headers: { origin: "https://evil.example.com" },
      },
      allow,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("origin not allowed");
  });
});
