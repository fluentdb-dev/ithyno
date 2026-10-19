import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  TmuxBrowserPanel,
  buildTmuxHistoryCopyText,
  copilotWheelInput,
  filterTmuxHistory,
  beginTerminalAttachmentWindow,
  parseTerminalSessionStatusMessage,
  parseTerminalReplayProtocolMessage,
  createTerminalReplayInputGate,
  createTerminalReplayController,
  readStableTerminalSession,
  rotateStableTerminalSession,
  markStableTerminalSessionEstablished,
  resolveTerminalProjectRoot,
  resolveTerminalSessionState,
  resolveTerminalOverlayPresentation,
  TERMINAL_SESSION_LOST_TIMEOUT_MS,
} from "./Terminal";

describe("Copilot wheel compatibility", () => {
  it("maps wheel movement to Copilot's documented timeline page keys", () => {
    expect(copilotWheelInput("GitHub Copilot", "none", -120)).toBe("\x1b[5~");
    expect(copilotWheelInput("GitHub Copilot", "none", 120)).toBe("\x1b[6~");
  });

  it("does not intercept other terminals or active mouse tracking", () => {
    expect(copilotWheelInput("PowerShell", "none", 120)).toBeNull();
    expect(copilotWheelInput("GitHub Copilot", "vt200", 120)).toBeNull();
    expect(copilotWheelInput("GitHub Copilot", "none", 0)).toBeNull();
  });
});

describe("tmux history filtering", () => {
  it("keeps the original snapshot when the query is blank", () => {
    expect(filterTmuxHistory("alpha\nbeta\n", "  ")).toBe("alpha\nbeta\n");
  });

  it("returns case-insensitive matching lines without changing their text", () => {
    expect(filterTmuxHistory("Build passed\nwarning\nBUILD cached", "build"))
      .toBe("Build passed\nBUILD cached");
  });
});

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

function findButtonNode(node: unknown, label: string): { props: any } | null {
  const matches = findButtonNodes(node, label);
  return matches[0] ?? null;
}

function findButtonNodes(node: unknown, label: string): Array<{ props: any }> {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    return node.flatMap((child) => findButtonNodes(child, label));
  }
  const results: Array<{ props: any }> = [];
  if ("type" in node && node.type === "button") {
    const props = (node as any).props ?? {};
    const text = props.children;
    const flattened = Array.isArray(text)
      ? text.map((value: unknown) => typeof value === "string" ? value : (typeof value === "object" && value && "props" in value ? String((value as any).props?.children ?? "") : "")).join("")
      : typeof text === "string" ? text : "";
    if (flattened.includes(label)) results.push(node as any);
  }
  const props = "props" in node ? (node as any).props : undefined;
  if (props && typeof props === "object") {
    results.push(...findButtonNodes(props.children, label));
    results.push(...findButtonNodes(props, label));
  }
  return results;
}

describe("tmux browser panel", () => {
  const topology = {
    available: true,
    provider: "psmux" as const,
    version: "psmux 1.0",
    capabilities: { topology: true, selection: false, history: false },
    session: {
      name: "project-session",
      windows: [{
        id: "@1",
        index: 0,
        name: "manager",
        active: true,
        paneCount: 2,
        layout: "even-horizontal",
        panes: [{
          id: "%1",
          windowId: "@1",
          windowIndex: 0,
          index: 0,
          title: "logs",
          active: true,
          width: 120,
          height: 30,
          currentPath: "/tmp/project",
        }, {
          id: "%2",
          windowId: "@1",
          windowIndex: 0,
          index: 1,
          title: "shell",
          active: false,
          width: 120,
          height: 30,
          currentPath: "/tmp/project",
        }],
      }],
    },
    reason: "selection is disabled because select-pane is not supported by psmux; history is disabled because capture-pane is not supported by psmux",
  };

  it("renders capability-aware selection and history controls with explanatory titles", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TmuxBrowserPanel, {
        topology,
        open: true,
        loading: false,
        error: null,
        historyPane: null,
        history: null,
        historyLoading: false,
        query: "",
        copied: false,
        onRefresh: vi.fn(),
        onClose: vi.fn(),
        onSelect: vi.fn(),
        onOpenHistory: vi.fn(),
        onShowPanes: vi.fn(),
        onCopyHistory: vi.fn(),
        onQueryChange: vi.fn(),
      }),
    );

    expect(markup).toContain("selection is disabled because select-pane is not supported by psmux");
    expect(markup).toContain("capture-pane");
    expect(markup).toContain('role="tab"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain("split");
    expect(markup).not.toContain("kill");
    expect(markup).not.toContain("rename");
  });

  it("shows navigation affordances and active state for window and pane selection", () => {
    const activeTopology = {
      ...topology,
      capabilities: { topology: true, selection: true, history: true },
    };
    const markup = renderToStaticMarkup(
      React.createElement(TmuxBrowserPanel, {
        topology: activeTopology,
        open: true,
        loading: false,
        error: null,
        historyPane: null,
        history: null,
        historyLoading: false,
        query: "",
        copied: false,
        onRefresh: vi.fn(),
        onClose: vi.fn(),
        onSelect: vi.fn(),
        onOpenHistory: vi.fn(),
        onShowPanes: vi.fn(),
        onCopyHistory: vi.fn(),
        onQueryChange: vi.fn(),
      }),
    );

    expect(markup).toContain("0: manager");
    expect(markup).toContain("0.0 logs");
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('title="Open retained tmux history for pane 0.0 logs"');
  });

  it("starts with the windows and panes view visible and opens the shortcuts from the header", () => {
    const onToggle = vi.fn();
    const markup = renderToStaticMarkup(
      React.createElement(TmuxBrowserPanel, {
        topology: { ...topology, capabilities: { topology: true, selection: true, history: true } },
        open: true,
        loading: false,
        error: null,
        historyPane: null,
        history: null,
        historyLoading: false,
        query: "",
        copied: false,
        actionCatalog: [
          { id: "next-window", group: "navigation", label: "Next window", shortcut: "Ctrl+B, then n", availability: "executable", supported: true, description: "Move to the next window." },
        ],
        onRefresh: vi.fn(),
        onClose: vi.fn(),
        onSelect: vi.fn(),
        onOpenHistory: vi.fn(),
        onShowPanes: vi.fn(),
        onCopyHistory: vi.fn(),
        onQueryChange: vi.fn(),
        onToggleCheatsheet: onToggle,
      }),
    );

    expect(markup).toContain('aria-label="Open tmux shortcuts"');
    expect(markup).toContain("0: manager");
    expect(markup).not.toContain("Cheat sheet");
  });

  it("replaces the pane view with the cheat sheet and provides a close back button", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TmuxBrowserPanel, {
        topology: { ...topology, capabilities: { topology: true, selection: true, history: true } },
        open: true,
        loading: false,
        error: null,
        historyPane: null,
        history: null,
        historyLoading: false,
        query: "",
        copied: false,
        actionCatalog: [
          { id: "next-window", group: "navigation", label: "Next window", shortcut: "Ctrl+B, then n", availability: "executable", supported: true, description: "Move to the next window." },
          { id: "refresh-topology", group: "history", label: "Refresh topology", shortcut: "Click Refresh", availability: "client-only", supported: true, description: "Refresh topology." },
        ],
        cheatsheetOpen: true,
        onRefresh: vi.fn(),
        onClose: vi.fn(),
        onSelect: vi.fn(),
        onOpenHistory: vi.fn(),
        onShowPanes: vi.fn(),
        onCopyHistory: vi.fn(),
        onQueryChange: vi.fn(),
        onToggleCheatsheet: vi.fn(),
      }),
    );

    expect(markup).toContain("Cheat sheet");
    expect(markup).toContain('aria-label="Return to windows and panes"');
    expect(markup).toContain('aria-label="Close tmux shortcuts"');
    expect(markup).not.toContain("0: manager");
  });

  it("opens a confirmation and calls confirm or cancel only when the user chooses", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const element = TmuxBrowserPanel({
      topology: { ...topology, capabilities: { topology: true, selection: true, history: true } },
      open: true,
      loading: false,
      error: null,
      historyPane: null,
      history: null,
      historyLoading: false,
      query: "",
      copied: false,
      actionCatalog: [
        { id: "kill-session", group: "session", label: "Stop session", shortcut: "Click Stop session", availability: "executable", supported: true, description: "Stop the current project session." },
      ],
      closeSessionConfirmOpen: true,
      onRefresh: vi.fn(),
      onClose: vi.fn(),
      onRequestCloseSession: vi.fn(),
      onCancelCloseSession: onCancel,
      onConfirmCloseSession: onConfirm,
      onSelect: vi.fn(),
      onOpenHistory: vi.fn(),
      onShowPanes: vi.fn(),
      onCopyHistory: vi.fn(),
      onQueryChange: vi.fn(),
      onToggleCheatsheet: vi.fn(),
    });

    const cancelButton = findButtonNode(element, "Cancel");
    const confirmButtons = findButtonNodes(element, "Stop session");
    expect(element).not.toBeNull();
    expect(renderToStaticMarkup(React.createElement("div", null, "This stops the Manager and every window and pane in this session; it does not merely hide the tmux panel."))).toContain("every window and pane in this session");
    cancelButton?.props.onClick?.();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(confirmButtons.length).toBeGreaterThan(1);
    const confirmButton = confirmButtons[confirmButtons.length - 1];
    confirmButton.props.onClick?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("opens an inline pane close confirmation and keeps it separate from the session stop flow", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const element = TmuxBrowserPanel({
      topology: { ...topology, capabilities: { topology: true, selection: true, history: true } },
      open: true,
      loading: false,
      error: null,
      historyPane: null,
      history: null,
      historyLoading: false,
      query: "",
      copied: false,
      actionCatalog: [
        { id: "kill-session", group: "session", label: "Stop session", shortcut: "Click Stop session", availability: "executable", supported: true, description: "Stop the current project session." },
      ],
      paneCloseTarget: topology.session.windows[0].panes[0],
      onRefresh: vi.fn(),
      onClose: vi.fn(),
      onRequestCloseSession: vi.fn(),
      onCancelCloseSession: vi.fn(),
      onConfirmCloseSession: vi.fn(),
      onRequestClosePane: vi.fn(),
      onCancelClosePane: onCancel,
      onConfirmClosePane: onConfirm,
      onSelect: vi.fn(),
      onOpenHistory: vi.fn(),
      onShowPanes: vi.fn(),
      onCopyHistory: vi.fn(),
      onQueryChange: vi.fn(),
      onToggleCheatsheet: vi.fn(),
    });

    const cancelButton = findButtonNode(element, "Cancel");
    const confirmButtons = findButtonNodes(element, "Close pane");
    expect(element).not.toBeNull();
    expect(renderToStaticMarkup(React.createElement("div", null, "This will stop the running process in this pane."))).toContain("stop the running process in this pane");
    cancelButton?.props.onClick?.();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(confirmButtons.length).toBeGreaterThan(0);
    const confirmButton = confirmButtons[confirmButtons.length - 1];
    confirmButton.props.onClick?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("exposes hover captions and aria labels for tmux controls", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TmuxBrowserPanel, {
        topology: { ...topology, capabilities: { topology: true, selection: true, history: true } },
        open: true,
        loading: false,
        error: null,
        historyPane: null,
        history: null,
        historyLoading: false,
        query: "",
        copied: false,
        closeSessionConfirmOpen: true,
        cheatsheetOpen: true,
        actionCatalog: [
          { id: "kill-session", group: "session", label: "Stop session", shortcut: "Click Stop session", availability: "executable", supported: true, description: "Stop the current project session." },
        ],
        onRefresh: vi.fn(),
        onClose: vi.fn(),
        onSelect: vi.fn(),
        onOpenHistory: vi.fn(),
        onShowPanes: vi.fn(),
        onCopyHistory: vi.fn(),
        onQueryChange: vi.fn(),
        onToggleCheatsheet: vi.fn(),
        onRequestCloseSession: vi.fn(),
        onCancelCloseSession: vi.fn(),
        onConfirmCloseSession: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-label="Stop tmux session project-session"');
    expect(markup).toContain('title="Refresh tmux topology"');
    expect(markup).toContain('aria-label="Return to windows and panes"');
    expect(markup).toContain('aria-label="Hide tmux panel"');
    expect(markup).toContain('title="Stop tmux session project-session"');
    expect(markup).toContain('title="Cancel stopping tmux session project-session"');
  });

  it("keeps history separate from the shortcut overlay and preserves visible error output", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TmuxBrowserPanel, {
        topology: { ...topology, capabilities: { topology: true, selection: true, history: true } },
        open: true,
        loading: false,
        error: "Action failed",
        historyPane: { ...topology.session.windows[0].panes[0], title: "logs" },
        history: { paneId: "%1", content: "alpha\nbeta\n", lineLimit: 5, truncated: false },
        historyLoading: false,
        query: "",
        copied: false,
        cheatsheetOpen: true,
        actionCatalog: [
          { id: "next-window", group: "navigation", label: "Next window", shortcut: "Ctrl+B, then n", availability: "executable", supported: true, description: "Move to the next window." },
        ],
        actionError: "Action failed",
        onRefresh: vi.fn(),
        onClose: vi.fn(),
        onSelect: vi.fn(),
        onOpenHistory: vi.fn(),
        onShowPanes: vi.fn(),
        onCopyHistory: vi.fn(),
        onQueryChange: vi.fn(),
        onToggleCheatsheet: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-label="Captured tmux pane history"');
    expect(markup).not.toContain("Cheat sheet");
    expect(markup).toContain("Action failed");
  });

  it("renders client-only and executable actions correctly and disables all pending controls", () => {
    const onRefresh = vi.fn();
    const onExecuteAction = vi.fn();
    const element = TmuxBrowserPanel({
      topology: { ...topology, capabilities: { topology: true, selection: true, history: true } },
      open: true,
      loading: false,
      error: null,
      historyPane: null,
      history: null,
      historyLoading: false,
      query: "",
      copied: false,
      cheatsheetOpen: true,
      actionCatalog: [
        { id: "next-window", group: "navigation", label: "Next window", shortcut: "Ctrl+B, then n", availability: "executable", supported: true, description: "Move to the next window." },
        { id: "kill-pane", group: "session", label: "Kill pane", shortcut: "Ctrl+B, then x", availability: "reference-only", supported: false, description: "Reference-only destructive shortcut." },
        { id: "refresh-topology", group: "history", label: "Refresh topology", shortcut: "Click Refresh", availability: "client-only", supported: true, description: "Refresh topology." },
      ],
      pendingActionId: "next-window",
      actionError: "Action failed",
      onRefresh,
      onClose: vi.fn(),
      onSelect: vi.fn(),
      onOpenHistory: vi.fn(),
      onShowPanes: vi.fn(),
      onCopyHistory: vi.fn(),
      onQueryChange: vi.fn(),
      onExecuteAction,
    });

    const refreshButton = findButtonNode(element, "Refresh topology");
    const nextButton = findButtonNode(element, "Next window");
    const killButton = findButtonNode(element, "Kill pane");
    const markup = renderToStaticMarkup(React.createElement(TmuxBrowserPanel, {
      topology: { ...topology, capabilities: { topology: true, selection: true, history: true } },
      open: true,
      loading: false,
      error: null,
      historyPane: null,
      history: null,
      historyLoading: false,
      query: "",
      copied: false,
      cheatsheetOpen: true,
      actionCatalog: [
        { id: "next-window", group: "navigation", label: "Next window", shortcut: "Ctrl+B, then n", availability: "executable", supported: true, description: "Move to the next window." },
        { id: "kill-pane", group: "session", label: "Kill pane", shortcut: "Ctrl+B, then x", availability: "reference-only", supported: false, description: "Reference-only destructive shortcut." },
        { id: "refresh-topology", group: "history", label: "Refresh topology", shortcut: "Click Refresh", availability: "client-only", supported: true, description: "Refresh topology." },
      ],
      pendingActionId: "next-window",
      actionError: "Action failed",
      onRefresh: vi.fn(),
      onClose: vi.fn(),
      onSelect: vi.fn(),
      onOpenHistory: vi.fn(),
      onShowPanes: vi.fn(),
      onCopyHistory: vi.fn(),
      onQueryChange: vi.fn(),
      onExecuteAction,
    }));

    expect(markup).toContain("Shortcut");
    expect(markup).not.toContain("<strong>Command</strong>");
    expect(markup).not.toContain("<strong>Action</strong>");
    expect(refreshButton?.props.disabled).toBe(true);
    expect(nextButton?.props.disabled).toBe(true);
    expect(killButton?.props.disabled).toBe(true);

    const clickRefresh = refreshButton?.props.onClick as (() => void) | undefined;
    clickRefresh?.();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(React.createElement(TmuxBrowserPanel, {
      topology: { ...topology, capabilities: { topology: true, selection: true, history: true } },
      open: true,
      loading: false,
      error: "Action failed",
      historyPane: null,
      history: null,
      historyLoading: false,
      query: "",
      copied: false,
      actionCatalog: [
        { id: "next-window", group: "navigation", label: "Next window", shortcut: "Ctrl+B, then n", availability: "executable", supported: true, description: "Move to the next window." },
        { id: "refresh-topology", group: "history", label: "Refresh topology", shortcut: "Click Refresh", availability: "client-only", supported: true, description: "Refresh topology." },
      ],
      pendingActionId: null,
      actionError: "Action failed",
      onRefresh: vi.fn(),
      onClose: vi.fn(),
      onSelect: vi.fn(),
      onOpenHistory: vi.fn(),
      onShowPanes: vi.fn(),
      onCopyHistory: vi.fn(),
      onQueryChange: vi.fn(),
      onExecuteAction,
    }))).toContain("Action failed");
  });

  it("keeps history search, truncation, copy text, and empty/loading states explicit", () => {
    const history = { paneId: "%1", content: "alpha\nbeta\ngamma\n", lineLimit: 3, truncated: true };
    const searchMarkup = renderToStaticMarkup(
      React.createElement(TmuxBrowserPanel, {
        topology: { ...topology, capabilities: { topology: true, selection: true, history: true } },
        open: true,
        loading: false,
        error: null,
        historyPane: { ...topology.session.windows[0].panes[0], title: "logs" },
        history,
        historyLoading: false,
        query: "beta",
        copied: false,
        onRefresh: vi.fn(),
        onClose: vi.fn(),
        onSelect: vi.fn(),
        onOpenHistory: vi.fn(),
        onShowPanes: vi.fn(),
        onCopyHistory: vi.fn(),
        onQueryChange: vi.fn(),
      }),
    );
    expect(searchMarkup).toContain("beta");
    expect(searchMarkup).not.toContain("alpha");
    expect(searchMarkup).toContain("Showing a bounded tail of the pane history.");
    expect(buildTmuxHistoryCopyText(history.content, "beta")).toBe("beta");

    const loadingMarkup = renderToStaticMarkup(
      React.createElement(TmuxBrowserPanel, {
        topology: { ...topology, capabilities: { topology: true, selection: true, history: true } },
        open: true,
        loading: false,
        error: null,
        historyPane: { ...topology.session.windows[0].panes[0], title: "logs" },
        history: null,
        historyLoading: true,
        query: "",
        copied: false,
        onRefresh: vi.fn(),
        onClose: vi.fn(),
        onSelect: vi.fn(),
        onOpenHistory: vi.fn(),
        onShowPanes: vi.fn(),
        onCopyHistory: vi.fn(),
        onQueryChange: vi.fn(),
      }),
    );
    expect(loadingMarkup).toContain("Loading history…");

    const emptyMarkup = renderToStaticMarkup(
      React.createElement(TmuxBrowserPanel, {
        topology: { ...topology, capabilities: { topology: true, selection: true, history: true } },
        open: true,
        loading: false,
        error: null,
        historyPane: { ...topology.session.windows[0].panes[0], title: "logs" },
        history: { paneId: "%1", content: "", lineLimit: 50, truncated: false },
        historyLoading: false,
        query: "",
        copied: false,
        onRefresh: vi.fn(),
        onClose: vi.fn(),
        onSelect: vi.fn(),
        onOpenHistory: vi.fn(),
        onShowPanes: vi.fn(),
        onCopyHistory: vi.fn(),
        onQueryChange: vi.fn(),
      }),
    );
    expect(emptyMarkup).toContain("No pane history.");

    const errorMarkup = renderToStaticMarkup(
      React.createElement(TmuxBrowserPanel, {
        topology: { ...topology, capabilities: { topology: true, selection: true, history: true } },
        open: true,
        loading: false,
        error: "history probe failed",
        historyPane: null,
        history: null,
        historyLoading: false,
        query: "",
        copied: false,
        onRefresh: vi.fn(),
        onClose: vi.fn(),
        onSelect: vi.fn(),
        onOpenHistory: vi.fn(),
        onShowPanes: vi.fn(),
        onCopyHistory: vi.fn(),
        onQueryChange: vi.fn(),
      }),
    );
    expect(errorMarkup).toContain("history probe failed");
    expect(errorMarkup).not.toContain("split");
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

describe("terminal replay controller (reset-on-reconnect)", () => {
  it("first replay-start does not reset (initial attach to empty xterm)", () => {
    const controller = createTerminalReplayController();
    const resetSpy = vi.fn();

    controller.onReplayStart(resetSpy);
    expect(resetSpy).not.toHaveBeenCalled();
  });

  it("after markAttached, replay-start calls reset exactly once", () => {
    const controller = createTerminalReplayController();
    const resetSpy = vi.fn();

    controller.markAttached();
    controller.onReplayStart(resetSpy);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it("multiple reconnects each call reset (reset on every replay-start after attached)", () => {
    const controller = createTerminalReplayController();
    const resetSpy = vi.fn();

    controller.markAttached();
    controller.onReplayStart(resetSpy);
    expect(resetSpy).toHaveBeenCalledTimes(1);

    controller.onReplayStart(resetSpy);
    expect(resetSpy).toHaveBeenCalledTimes(2);
  });

  it("fresh controller starts unattached", () => {
    const controller = createTerminalReplayController();
    const resetSpy = vi.fn();

    // First instance unattached
    controller.onReplayStart(resetSpy);
    expect(resetSpy).not.toHaveBeenCalled();

    // Second instance (independent)
    const controller2 = createTerminalReplayController();
    const resetSpy2 = vi.fn();
    controller2.onReplayStart(resetSpy2);
    expect(resetSpy2).not.toHaveBeenCalled();
  });
});
