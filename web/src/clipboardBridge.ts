// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * VS Code clipboard bridge — dashboard side.
 *
 * Message types for the clipboard read request / response protocol between
 * the dashboard iframe and the Extension Host.
 */
export interface VsCodeClipboardRequest {
  type: "ithyno:clipboard-read-request";
  requestId: string;
}

export interface VsCodeClipboardResponse {
  type: "ithyno:clipboard-read-response";
  requestId: string;
  text: string;
}

/**
 * Compute the new field value after inserting `text` at the current selection.
 * Returns the new string and the resulting cursor position.
 */
export function computeInsertedValue(
  currentValue: string,
  selectionStart: number,
  selectionEnd: number,
  text: string,
): { newValue: string; cursorPos: number } {
  const newValue =
    currentValue.slice(0, selectionStart) + text + currentValue.slice(selectionEnd);
  return { newValue, cursorPos: selectionStart + text.length };
}

/**
 * Decide whether a clipboard response should be applied.
 * Rejects stale, mismatched, or detached-field responses.
 */
export function shouldApplyClipboardResponse(opts: {
  responseRequestId: string;
  pendingRequestId: string | null;
  pendingElement: Element | null;
  activeElement: Element | null;
}): boolean {
  const { responseRequestId, pendingRequestId, pendingElement, activeElement } = opts;
  if (!pendingRequestId || responseRequestId !== pendingRequestId) return false;
  if (!pendingElement || !(pendingElement as HTMLElement).isConnected) return false;
  if (pendingElement !== activeElement) return false;
  return true;
}

/**
 * Insert `text` into a focused `input` or `textarea`, respecting the current
 * selection (replaces selected range, or inserts at caret). Dispatches a
 * synthetic `input` event so React controlled fields pick up the change.
 */
export function insertTextIntoField(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string,
): void {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const { newValue, cursorPos } = computeInsertedValue(el.value, start, end, text);

  // Use the native value setter to bypass React's synthetic event guard,
  // then fire a real `input` event so React's onChange handler fires.
  const proto =
    el instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(el, newValue);
  } else {
    el.value = newValue;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.setSelectionRange(cursorPos, cursorPos);
}
