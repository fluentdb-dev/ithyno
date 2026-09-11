import { describe, expect, it } from "vitest";
import {
  beginTerminalAttachmentWindow,
  parseTerminalSessionStatusMessage,
  readStableTerminalSession,
  rotateStableTerminalSession,
  markStableTerminalSessionEstablished,
  resolveTerminalSessionState,
  TERMINAL_SESSION_LOST_TIMEOUT_MS,
} from "./Terminal";

describe("terminal attachment deadline", () => {
  it("keeps the original deadline across repeated transport open/close cycles", () => {
    const first = beginTerminalAttachmentWindow(null, 1_000);
    const afterTransportOpen = beginTerminalAttachmentWindow(first, 5_000);
    const afterAnotherReconnect = beginTerminalAttachmentWindow(afterTransportOpen, 12_000);

    expect(first).toBe(1_000);
    expect(afterTransportOpen).toBe(1_000);
    expect(afterAnotherReconnect).toBe(1_000);
    expect(resolveTerminalSessionState("reconnecting", afterAnotherReconnect, 16_001)).toBe("lost");
  });

  it("starts a new deadline only after a successful handshake cleared the previous one", () => {
    expect(beginTerminalAttachmentWindow(null, 20_000)).toBe(20_000);
  });
});

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("stable terminal session storage", () => {
  it("starts as create + unestablished on first read", () => {
    const storage = makeStorage();
    const session = readStableTerminalSession("/tmp/project", storage);

    expect(session).toMatchObject({ intent: "create", established: false });
    expect(session.key).toContain("/tmp/project");
  });

  it("marks the session as reattach + established after the first attach handshake", () => {
    const storage = makeStorage();
    const initial = readStableTerminalSession("/tmp/project", storage);

    markStableTerminalSessionEstablished("/tmp/project", initial.key, storage);
    const next = readStableTerminalSession("/tmp/project", storage);

    expect(next).toEqual({ key: initial.key, intent: "reattach", established: true });
  });

  it("keeps a rotated session in create state until the attach handshake arrives", () => {
    const storage = makeStorage();
    const first = readStableTerminalSession("/tmp/project", storage);
    const rotated = rotateStableTerminalSession("/tmp/project", storage);

    expect(rotated).not.toBe(first.key);
    expect(readStableTerminalSession("/tmp/project", storage)).toMatchObject({
      key: rotated,
      intent: "create",
      established: false,
    });

    markStableTerminalSessionEstablished("/tmp/project", rotated, storage);
    expect(readStableTerminalSession("/tmp/project", storage)).toMatchObject({
      key: rotated,
      intent: "reattach",
      established: true,
    });
  });

  it("recovers from malformed stored metadata by creating a fresh unestablished session", () => {
    const storage = makeStorage();
    storage.setItem("ithyno-terminal-session-key:/tmp/project", "{not valid json");

    const recovered = readStableTerminalSession("/tmp/project", storage);

    expect(recovered).toMatchObject({ intent: "create", established: false });
    expect(storage.getItem("ithyno-terminal-session-key:/tmp/project")).toContain('"intent":"create"');
  });
});

describe("resolveTerminalSessionState", () => {
  it("keeps a transient disconnect in reconnecting state", () => {
    const now = 10_000;
    expect(
      resolveTerminalSessionState("connected", now - 1_000, now, TERMINAL_SESSION_LOST_TIMEOUT_MS),
    ).toBe("reconnecting");
  });

  it("does not surface the lost overlay while reconnect is still underway", () => {
    const now = 10_000;
    expect(
      resolveTerminalSessionState("reconnecting", now - 9_000, now, TERMINAL_SESSION_LOST_TIMEOUT_MS),
    ).toBe("reconnecting");
  });

  it("marks the session lost once the reattach window expires", () => {
    const now = 10_000;
    expect(
      resolveTerminalSessionState("reconnecting", now - TERMINAL_SESSION_LOST_TIMEOUT_MS - 1, now, TERMINAL_SESSION_LOST_TIMEOUT_MS),
    ).toBe("lost");
  });

  it("stays lost once the session has already timed out", () => {
    const now = 10_000;
    expect(
      resolveTerminalSessionState("lost", now - 5_000, now, TERMINAL_SESSION_LOST_TIMEOUT_MS),
    ).toBe("lost");
  });

  it("recognizes the server handshake when the PTY is missing or reattached", () => {
    expect(parseTerminalSessionStatusMessage(JSON.stringify({ type: "session-status", status: "attached" }))).toEqual({
      status: "attached",
      sessionKey: undefined,
    });
    expect(parseTerminalSessionStatusMessage(JSON.stringify({ type: "session-status", status: "missing", sessionKey: "abc" }))).toEqual({
      status: "missing",
      sessionKey: "abc",
    });
    expect(parseTerminalSessionStatusMessage(JSON.stringify({ type: "session-status", status: "terminated", sessionKey: "def" }))).toEqual({
      status: "terminated",
      sessionKey: "def",
    });
  });

  it("ignores unrelated websocket payloads", () => {
    expect(parseTerminalSessionStatusMessage(JSON.stringify({ type: "data", payload: "x" }))).toBeNull();
    expect(parseTerminalSessionStatusMessage("not-json")).toBeNull();
  });
});
