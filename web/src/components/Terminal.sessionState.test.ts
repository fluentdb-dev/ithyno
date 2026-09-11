import { describe, expect, it } from "vitest";
import {
  parseTerminalSessionStatusMessage,
  resolveTerminalSessionState,
  TERMINAL_SESSION_LOST_TIMEOUT_MS,
} from "./Terminal";

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

  it("recognizes the server handshake when the PTY is missing or reattached", () => {
    expect(parseTerminalSessionStatusMessage(JSON.stringify({ type: "session-status", status: "attached" }))).toEqual({
      status: "attached",
      sessionKey: undefined,
    });
    expect(parseTerminalSessionStatusMessage(JSON.stringify({ type: "session-status", status: "missing", sessionKey: "abc" }))).toEqual({
      status: "missing",
      sessionKey: "abc",
    });
  });
});
