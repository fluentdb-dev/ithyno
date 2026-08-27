// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { computeInsertedValue, shouldApplyClipboardResponse } from "./clipboardBridge";

// ---- computeInsertedValue (task 4.1) ----------------------------------------

describe("computeInsertedValue — clipboard text insertion", () => {
  it("inserts at a caret (start === end)", () => {
    const { newValue, cursorPos } = computeInsertedValue("hello ", 6, 6, "world");
    expect(newValue).toBe("hello world");
    expect(cursorPos).toBe(11);
  });

  it("replaces a selected range", () => {
    const { newValue, cursorPos } = computeInsertedValue("foo bar baz", 4, 7, "qux");
    expect(newValue).toBe("foo qux baz");
    expect(cursorPos).toBe(7);
  });

  it("replaces the entire value when everything is selected", () => {
    const { newValue, cursorPos } = computeInsertedValue("old", 0, 3, "new");
    expect(newValue).toBe("new");
    expect(cursorPos).toBe(3);
  });

  it("inserts at position 0", () => {
    const { newValue, cursorPos } = computeInsertedValue("world", 0, 0, "hello ");
    expect(newValue).toBe("hello world");
    expect(cursorPos).toBe(6);
  });

  it("preserves text before and after the selection", () => {
    const before = "abc";
    const after = "xyz";
    const original = before + "DEL" + after;
    const { newValue } = computeInsertedValue(original, 3, 6, "--ins--");
    expect(newValue).toBe(before + "--ins--" + after);
  });

  it("inserts empty string at caret (no-op value, cursor advances 0)", () => {
    const { newValue, cursorPos } = computeInsertedValue("abc", 1, 1, "");
    expect(newValue).toBe("abc");
    expect(cursorPos).toBe(1);
  });
});

// ---- shouldApplyClipboardResponse (task 4.2) --------------------------------

describe("shouldApplyClipboardResponse — stale-response rejection", () => {
  function makeElement(connected = true): Element {
    return { isConnected: connected } as unknown as Element;
  }

  it("applies when request IDs match, element is connected and active", () => {
    const el = makeElement(true);
    expect(
      shouldApplyClipboardResponse({
        responseRequestId: "abc",
        pendingRequestId: "abc",
        pendingElement: el,
        activeElement: el,
      }),
    ).toBe(true);
  });

  it("rejects when request IDs do not match (stale response)", () => {
    const el = makeElement(true);
    expect(
      shouldApplyClipboardResponse({
        responseRequestId: "xyz",
        pendingRequestId: "abc",
        pendingElement: el,
        activeElement: el,
      }),
    ).toBe(false);
  });

  it("rejects when there is no pending request", () => {
    const el = makeElement(true);
    expect(
      shouldApplyClipboardResponse({
        responseRequestId: "abc",
        pendingRequestId: null,
        pendingElement: el,
        activeElement: el,
      }),
    ).toBe(false);
  });

  it("rejects when the pending element is null (already cleared)", () => {
    expect(
      shouldApplyClipboardResponse({
        responseRequestId: "abc",
        pendingRequestId: "abc",
        pendingElement: null,
        activeElement: null,
      }),
    ).toBe(false);
  });

  it("rejects when the pending element is no longer connected (detached from DOM)", () => {
    const el = makeElement(false);
    expect(
      shouldApplyClipboardResponse({
        responseRequestId: "abc",
        pendingRequestId: "abc",
        pendingElement: el,
        activeElement: el,
      }),
    ).toBe(false);
  });

  it("rejects when a different element has focus (focus moved before response)", () => {
    const pendingEl = makeElement(true);
    const otherEl = makeElement(true);
    expect(
      shouldApplyClipboardResponse({
        responseRequestId: "abc",
        pendingRequestId: "abc",
        pendingElement: pendingEl,
        activeElement: otherEl,
      }),
    ).toBe(false);
  });
});
