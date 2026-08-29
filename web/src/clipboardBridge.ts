// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * VS Code clipboard bridge — dashboard side.
 *
 * Message types for the clipboard read request / response protocol between
 * the dashboard iframe and the Extension Host.
 */
import { isVsCodeShell, postToVsCode } from "./runtime/shell";

export interface VsCodeClipboardRequest {
  type: "ithyno:clipboard-read-request";
  requestId: string;
}

export interface VsCodeClipboardResponse {
  type: "ithyno:clipboard-read-response";
  requestId: string;
  text: string;
}

export interface VsCodeClipboardWriteRequest {
  type: "ithyno:clipboard-write-request";
  requestId: string;
  text: string;
}

export interface VsCodeClipboardWriteResponse {
  type: "ithyno:clipboard-write-response";
  requestId: string;
  error?: string;
}

function newRequestId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export type ClipboardWriter = Pick<Clipboard, "writeText">;

let activeWriteRequestId: string | null = null;
let activeWriteReject: ((reason?: unknown) => void) | null = null;
let activeWriteCancel: (() => void) | null = null;

/** Write text through the VS Code Extension Host clipboard API. */
function writeViaVsCode(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = newRequestId();
    // A newer copy supersedes any pending bridge request. Rejecting and
    // removing the previous listener prevents a delayed response from an
    // earlier click from affecting the current operation.
    activeWriteCancel?.();
    activeWriteReject?.(new Error("Clipboard request superseded"));
    activeWriteRequestId = requestId;
    activeWriteReject = reject;
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data as Partial<VsCodeClipboardWriteResponse> | null;
      if (
        !msg ||
        msg.type !== "ithyno:clipboard-write-response" ||
        msg.requestId !== requestId
      ) return;
      window.removeEventListener("message", handleMessage);
      if (activeWriteRequestId === requestId) {
        activeWriteRequestId = null;
        activeWriteReject = null;
        activeWriteCancel = null;
      }
      if (typeof msg.error === "string" && msg.error.length > 0) {
        reject(new Error(msg.error));
      } else {
        resolve();
      }
    };
    window.addEventListener("message", handleMessage);
    activeWriteCancel = () => window.removeEventListener("message", handleMessage);
    postToVsCode(
      { type: "ithyno:clipboard-write-request", requestId, text } satisfies VsCodeClipboardWriteRequest,
    );
  });
}

/**
 * Write to the system clipboard in the active shell. VS Code webviews use
 * the Extension Host bridge because nested iframe clipboard permissions are
 * not reliable; browser and Electron callers retain the native API.
 */
export async function writeClipboardText(
  text: string,
  clipboard?: ClipboardWriter,
): Promise<void> {
  if (clipboard) {
    await clipboard.writeText(text);
    return;
  }
  if (typeof window !== "undefined" && isVsCodeShell()) {
    await writeViaVsCode(text);
    return;
  }
  await navigator.clipboard.writeText(text);
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
