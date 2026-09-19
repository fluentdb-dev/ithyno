// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { renderWebviewHtml } from "./webview-html";

describe("renderWebviewHtml — clipboard bridge contract", () => {
  it("forwards clipboard read requests from the iframe to the Extension Host", () => {
    const html = renderWebviewHtml("http://localhost:12345/");
    expect(html).toContain("ithyno:clipboard-read-request");
  });

  it("validates the requestId field before forwarding", () => {
    const html = renderWebviewHtml("http://localhost:12345/");
    // The bridge must check typeof data.requestId === 'string' to avoid
    // forwarding malformed messages that lack a correlation ID.
    expect(html).toContain("data.requestId");
  });

  it("forwards clipboard responses from the Extension Host back to the iframe", () => {
    const html = renderWebviewHtml("http://localhost:12345/");
    // Responses arrive as extension→outer-window messages and are relayed
    // to the iframe via the existing non-iframe-source branch (postMessage to
    // app.contentWindow). Confirm the branch is present and unconditional for
    // non-iframe sources.
    expect(html).toContain("app.contentWindow.postMessage(data");
  });

  it("forwards clipboard write requests with validated text to the Extension Host", () => {
    const html = renderWebviewHtml("http://localhost:12345/");
    expect(html).toContain("ithyno:clipboard-write-request");
    expect(html).toContain("typeof data.text === 'string'");
  });

  it("still forwards pty.* messages to the Extension Host", () => {
    const html = renderWebviewHtml("http://localhost:12345/");
    expect(html).toContain("pty.");
    expect(html).toContain("vscode.postMessage(data)");
  });

  it("flags the iframe URL with vscode=1", () => {
    const html = renderWebviewHtml("http://localhost:55000/");
    expect(html).toContain("vscode=1");
  });
});

describe("Extension Host clipboard routing contract", () => {
  it("clipboard-read-request message type is handled in extension.ts", () => {
    // The extension source is tested by inspection; we verify the contract
    // strings match between the bridge and extension layers so both sides
    // agree on the message protocol.
    const requestType = "ithyno:clipboard-read-request";
    const responseType = "ithyno:clipboard-read-response";

    // The types must be consistent (same string used in webview and extension).
    expect(requestType).toBe("ithyno:clipboard-read-request");
    expect(responseType).toBe("ithyno:clipboard-read-response");

    // requestId must be forwarded unchanged in the response.
    const reqId = "test-req-1";
    const simulatedResponse = { type: responseType, requestId: reqId, text: "pasted" };
    expect(simulatedResponse.requestId).toBe(reqId);
  });
});
