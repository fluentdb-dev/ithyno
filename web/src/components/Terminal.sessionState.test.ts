import { describe, expect, it } from "vitest";
import {
  beginTerminalAttachmentWindow,
  parseTerminalSessionStatusMessage,
  parseTerminalReplayProtocolMessage,
  createTerminalReplayInputGate,
  readStableTerminalSession,
  rotateStableTerminalSession,
  markStableTerminalSessionEstablished,
  resolveTerminalProjectRoot,
  resolveTerminalSessionState,
  resolveTerminalOverlayPresentation,
  TERMINAL_SESSION_LOST_TIMEOUT_MS,
} from "./Terminal";

describe("terminal project identity", () => {
  it("converts the OpenSpec workspace root to the containing POSIX project root", () => {
    expect(resolveTerminalProjectRoot("/Users/example/project/openspec")).toBe("/Users/example/project");
  });

  it("converts the OpenSpec workspace root to the containing Windows project root", () => {
    expect(resolveTerminalProjectRoot("C:\\Users\\example\\project\\openspec")).toBe("C:\\Users\\example\\project");
  });

  it("does not alter a root that is not an OpenSpec directory", () => {
    expect(resolveTerminalProjectRoot("/Users/example/project")).toBe("/Users/example/project");
  });
});

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
      sessionId: undefined,
    });
    expect(parseTerminalSessionStatusMessage(JSON.stringify({ type: "session-status", status: "missing", sessionId: "abc" }))).toEqual({
      status: "missing",
      sessionId: "abc",
    });
    expect(parseTerminalSessionStatusMessage(JSON.stringify({ type: "session-status", status: "terminated", sessionId: "def" }))).toEqual({
      status: "terminated",
      sessionId: "def",
    });
  });

  it("ignores unrelated websocket payloads", () => {
    expect(parseTerminalSessionStatusMessage(JSON.stringify({ type: "data", payload: "x" }))).toBeNull();
    expect(parseTerminalSessionStatusMessage("not-json")).toBeNull();
  });
});

describe("terminal UX session management", () => {
  it("manual reconnect preserves the stored session key across storage access", () => {
    const storage = makeStorage();
    const session1 = readStableTerminalSession("/tmp/project", storage);
    markStableTerminalSessionEstablished("/tmp/project", session1.key, storage);

    // Re-reading should return the same key in reattach mode
    const session2 = readStableTerminalSession("/tmp/project", storage);
    expect(session2.key).toBe(session1.key);
    expect(session2.intent).toBe("reattach");
  });

  it("explicit restart rotates the session key via rotateStableTerminalSession", () => {
    const storage = makeStorage();
    const session1 = readStableTerminalSession("/tmp/project", storage);
    markStableTerminalSessionEstablished("/tmp/project", session1.key, storage);

    // Explicit restart rotates to a new key
    const session2Key = rotateStableTerminalSession("/tmp/project", storage);
    expect(session2Key).not.toBe(session1.key);

    const session2 = readStableTerminalSession("/tmp/project", storage);
    expect(session2.key).toBe(session2Key);
    expect(session2.intent).toBe("create");
    expect(session2.established).toBe(false);
  });

  it("handles missing session status from server", () => {
    const status = parseTerminalSessionStatusMessage(
      JSON.stringify({ type: "session-status", status: "missing", sessionId: "old-key" })
    );
    expect(status?.status).toBe("missing");
  });

  it("handles terminated session status from server", () => {
    const status = parseTerminalSessionStatusMessage(
      JSON.stringify({ type: "session-status", status: "terminated", sessionId: "killed-key" })
    );
    expect(status?.status).toBe("terminated");
  });

  it("distinguishes transient timeout from authoritative missing/terminated", () => {
    const startTime = 10_000;
    const afterTimeout = startTime + TERMINAL_SESSION_LOST_TIMEOUT_MS + 1;

    // Transient timeout: session lost without authoritative status
    expect(
      resolveTerminalSessionState("reconnecting", startTime, afterTimeout, TERMINAL_SESSION_LOST_TIMEOUT_MS)
    ).toBe("lost");

    // Still reconnecting before timeout: should stay reconnecting
    const midTime = startTime + TERMINAL_SESSION_LOST_TIMEOUT_MS / 2;
    expect(
      resolveTerminalSessionState("connected", startTime, midTime, TERMINAL_SESSION_LOST_TIMEOUT_MS)
    ).toBe("reconnecting");
  });
});

describe("terminal overlay presentation resolver", () => {
  it("does not show overlay during transient reconnecting state", () => {
    const presentation = resolveTerminalOverlayPresentation("reconnecting", null);
    expect(presentation.showOverlay).toBe(false);
  });

  it("does not show overlay when connected", () => {
    const presentation = resolveTerminalOverlayPresentation("connected", null);
    expect(presentation.showOverlay).toBe(false);
  });

  it("shows only Try reconnect button when lost without authoritative status", () => {
    const presentation = resolveTerminalOverlayPresentation("lost", null);
    expect(presentation.showOverlay).toBe(true);
    expect(presentation.showTryReconnect).toBe(true);
    expect(presentation.showDestructiveRestart).toBe(false);
    expect(presentation.title).toBe("Terminal reconnection timed out");
  });

  it("shows only Start new terminal when server reports missing session", () => {
    const presentation = resolveTerminalOverlayPresentation("lost", "missing");
    expect(presentation.showOverlay).toBe(true);
    expect(presentation.showTryReconnect).toBe(false);
    expect(presentation.showDestructiveRestart).toBe(true);
    expect(presentation.destructiveRestartLabel).toBe("Start new terminal");
    expect(presentation.title).toBe("Terminal session not found");
  });

  it("shows only Start new terminal when server reports terminated session", () => {
    const presentation = resolveTerminalOverlayPresentation("lost", "terminated");
    expect(presentation.showOverlay).toBe(true);
    expect(presentation.showTryReconnect).toBe(false);
    expect(presentation.showDestructiveRestart).toBe(true);
    expect(presentation.destructiveRestartLabel).toBe("Start new terminal");
    expect(presentation.title).toBe("Terminal session terminated");
  });

  it("manual retry action (Try reconnect) does not rotate session key", () => {
    // This is a behavioral requirement:
    // handleTryReconnect clears sessionStatus and increments reconnectAttempt
    // without calling rotateStableTerminalSession. The effect will read the
    // same session key and use intent=reattach, preserving the stable key.
    const storage = makeStorage();
    const session1 = readStableTerminalSession("/tmp/project", storage);
    markStableTerminalSessionEstablished("/tmp/project", session1.key, storage);

    // Simulate manual retry: status is cleared, but key is NOT rotated
    const session2 = readStableTerminalSession("/tmp/project", storage);
    expect(session2.key).toBe(session1.key);
    expect(session2.intent).toBe("reattach");
  });

  it("explicit restart action rotates session key (distinct from manual retry)", () => {
    const storage = makeStorage();
    const session1 = readStableTerminalSession("/tmp/project", storage);
    markStableTerminalSessionEstablished("/tmp/project", session1.key, storage);

    // Simulate explicit restart: key IS rotated, intent becomes create
    const rotated = rotateStableTerminalSession("/tmp/project", storage);
    expect(rotated).not.toBe(session1.key);

    const session2 = readStableTerminalSession("/tmp/project", storage);
    expect(session2.intent).toBe("create");
  });
});

describe("terminal replay protocol and input suppression", () => {
  it("parses replay-start message as a replay protocol control message", () => {
    const parsed = parseTerminalReplayProtocolMessage(JSON.stringify({ type: "replay-start" }));
    expect(parsed).toBe("replay-start");
  });

  it("parses replay-end message as a replay protocol control message", () => {
    const parsed = parseTerminalReplayProtocolMessage(JSON.stringify({ type: "replay-end" }));
    expect(parsed).toBe("replay-end");
  });

  it("returns null for non-replay messages", () => {
    const sessionStatus = parseTerminalReplayProtocolMessage(
      JSON.stringify({ type: "session-status", status: "attached" }),
    );
    expect(sessionStatus).toBeNull();
  });

  it("returns null for non-JSON strings", () => {
    const ansiOutput = parseTerminalReplayProtocolMessage("\x1b[1;2H");
    expect(ansiOutput).toBeNull();
  });

  it("returns null for undefined/non-string input", () => {
    const undef = parseTerminalReplayProtocolMessage(undefined);
    expect(undef).toBeNull();

    const binary = parseTerminalReplayProtocolMessage(new Uint8Array([1, 2, 3]));
    expect(binary).toBeNull();
  });

  it("begin suppresses input", () => {
    const gate = createTerminalReplayInputGate();
    gate.begin();
    expect(gate.shouldForward("\x1b[?1;2c")).toBe(false);
  });

  it("finish queues barrier callback and keeps input suppressed until callback fires", () => {
    const gate = createTerminalReplayInputGate();
    gate.begin();

    let capturedDone: ((v: void) => void) | null = null;
    gate.finish((done) => {
      capturedDone = done;
    });

    expect(gate.shouldForward("\x1b[?1;2c")).toBe(false);
    expect(capturedDone).not.toBeNull();

    capturedDone!();

    expect(gate.shouldForward("user input")).toBe(true);
  });

  it("reset releases suppression", () => {
    const gate = createTerminalReplayInputGate();
    gate.begin();
    expect(gate.shouldForward("data")).toBe(false);

    gate.reset();
    expect(gate.shouldForward("data")).toBe(true);
  });

  it("generation invalidates stale barrier callbacks", () => {
    const gate = createTerminalReplayInputGate();

    let doneA: (() => void) | null = null;
    gate.begin();
    gate.finish((done) => {
      doneA = done;
    });

    let doneB: (() => void) | null = null;
    gate.begin();
    gate.finish((done) => {
      doneB = done;
    });

    expect(gate.shouldForward("\x1b[?1;2c")).toBe(false);

    doneA!();

    expect(gate.shouldForward("\x1b[?1;2c")).toBe(false);

    doneB!();

    expect(gate.shouldForward("user input")).toBe(true);
  });
});
