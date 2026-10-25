// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from "vitest";
import { resolvedTmuxSessionName } from "./sync/pty.js";
import {
  captureTmuxPaneHistory,
  executeTmuxAction,
  getTmuxActionCatalog,
  getTmuxTopology,
  parseTmuxTopology,
  selectTmuxTarget,
  TmuxBrowserError,
  type TmuxCommandRunner,
} from "./tmux-browser.js";

const windows = "@1\t0\tmanager\t1\t2\tlayout-a\n@2\t1\treview\t0\t1\tlayout-b\n";
const panes = "%1\t@1\t0\t0\tManager\t1\t100\t30\t/tmp/project\n%2\t@1\t0\t1\tLogs\t0\t80\t30\t/tmp/project\n%3\t@2\t1\t0\tReview\t1\t90\t25\t/tmp/project\n";

function runner(overrides: Record<string, { stdout?: string; stderr?: string; error?: Error }> = {}): TmuxCommandRunner {
  return vi.fn(async (args) => {
    const key = args[0];
    const match = overrides[key];
    if (match?.error) throw match.error;
    if (match) return { stdout: match.stdout ?? "", stderr: match.stderr ?? "" };
    if (key === "-V") return { stdout: "tmux 3.6a\n", stderr: "" };
    if (key === "has-session") return { stdout: "", stderr: "" };
    if (key === "list-windows") return { stdout: windows, stderr: "" };
    if (key === "list-panes") return { stdout: panes, stderr: "" };
    if (key === "capture-pane") return { stdout: "one\ntwo\nthree\n", stderr: "" };
    return { stdout: "", stderr: "" };
  });
}

describe("tmux browser", () => {
  it("parses windows and panes into a nested topology", () => {
    const result = parseTmuxTopology("ithyno-test", windows, panes);
    expect(result?.windows).toHaveLength(2);
    expect(result?.windows[0]).toMatchObject({ id: "@1", name: "manager", active: true, paneCount: 2 });
    expect(result?.windows[0].panes[1]).toMatchObject({ id: "%2", title: "Logs", active: false });
  });

  it("returns only the project-derived session topology", async () => {
    const run = runner();
    const result = await getTmuxTopology("/tmp/project", { runner: run, platform: "darwin" });
    expect(result.available).toBe(true);
    expect(result.provider).toBe("tmux");
    expect(result.session?.windows).toHaveLength(2);
    expect(run).toHaveBeenCalledWith(expect.arrayContaining(["has-session", "-t"]));
  });

  it("reports a missing project session without failing tmux availability", async () => {
    const missing = Object.assign(new Error("no session"), { code: 1 });
    const result = await getTmuxTopology("/tmp/project", {
      runner: runner({ "has-session": { error: missing } }),
    });
    expect(result).toMatchObject({ available: true, session: null });
  });

  it("reports an unavailable binary", async () => {
    const unavailable = new TmuxBrowserError("unavailable", "tmux is not available on PATH");
    const result = await getTmuxTopology("/tmp/project", {
      runner: runner({ "-V": { error: unavailable } }),
    });
    expect(result).toMatchObject({ available: false, provider: null, session: null });
    expect(result.capabilities.history).toBe(false);
  });

  it("selects only windows returned by the fresh topology", async () => {
    const run = runner();
    await selectTmuxTarget("/tmp/project", { windowId: "@2" }, { runner: run });
    expect(run).toHaveBeenCalledWith(expect.arrayContaining(["select-window", "-t"]));
    await expect(selectTmuxTarget("/tmp/project", { windowId: "@99" }, { runner: run }))
      .rejects.toMatchObject({ kind: "target-missing" });
  });

  it("selects a pane through its containing window", async () => {
    const run = runner();
    await selectTmuxTarget("/tmp/project", { paneId: "%3" }, { runner: run });
    expect(run).toHaveBeenCalledWith(["select-pane", "-t", "%3"]);
  });

  it("captures bounded history without selecting the pane", async () => {
    const run = runner();
    const result = await captureTmuxPaneHistory("/tmp/project", "%2", 200, { runner: run });
    expect(result).toMatchObject({ paneId: "%2", lineLimit: 200, content: "one\ntwo\nthree\n" });
    expect(run).toHaveBeenCalledWith(["capture-pane", "-p", "-J", "-S", "-200", "-t", "%2"]);
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(["select-pane"]));
  });

  it("enforces exact line limits without marking exact-size captures as truncated", async () => {
    const run = runner({ "capture-pane": { stdout: "one\ntwo\nthree\n" } });
    const result = await captureTmuxPaneHistory("/tmp/project", "%2", 3, { runner: run });
    expect(result).toMatchObject({ paneId: "%2", lineLimit: 3, content: "one\ntwo\nthree\n", truncated: false });
  });

  it("applies a tail cut when capture exceeds the configured limit", async () => {
    const run = runner({ "capture-pane": { stdout: "one\ntwo\nthree\nfour\nfive\n" } });
    const result = await captureTmuxPaneHistory("/tmp/project", "%2", 3, { runner: run });
    expect(result).toMatchObject({ paneId: "%2", lineLimit: 3, truncated: true });
    expect(result.content).toBe("three\nfour\nfive\n");
  });

  it("truncates by byte cap and preserves the tail", async () => {
    const payload = "a".repeat(700_000);
    const run = runner({ "capture-pane": { stdout: payload } });
    const result = await captureTmuxPaneHistory("/tmp/project", "%2", 10_000, { runner: run });
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.content, "utf8")).toBeLessThanOrEqual(512 * 1024);
    expect(result.content.endsWith("a")).toBe(true);
  });

  it("requires both selection commands to be available for selection capability", async () => {
    const run = vi.fn(async (args) => {
      if (args[0] === "-V") return { stdout: "psmux 1.0\n", stderr: "" };
      if (args[0] === "has-session") return { stdout: "", stderr: "" };
      if (args[0] === "list-commands") return { stdout: "select-window\n", stderr: "" };
      if (args[0] === "list-windows") return { stdout: windows, stderr: "" };
      if (args[0] === "list-panes") return { stdout: panes, stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const result = await getTmuxTopology("/tmp/project", { runner: run, platform: "win32" });
    expect(result.capabilities.selection).toBe(false);
    expect(result.reason).toContain("select-pane");
  });

  it("disables history when psmux exposes selection but not capture-pane", async () => {
    const run = vi.fn(async (args) => {
      if (args[0] === "-V") return { stdout: "psmux 1.0\n", stderr: "" };
      if (args[0] === "has-session") return { stdout: "", stderr: "" };
      if (args[0] === "list-commands") return { stdout: "select-window\nselect-pane\n", stderr: "" };
      if (args[0] === "list-windows") return { stdout: windows, stderr: "" };
      if (args[0] === "list-panes") return { stdout: panes, stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const result = await getTmuxTopology("/tmp/project", { runner: run, platform: "win32" });
    expect(result.provider).toBe("psmux");
    expect(result.capabilities.selection).toBe(true);
    expect(result.capabilities.history).toBe(false);
    expect(result.reason).toContain("capture-pane");
  });

  it("marks topology unavailable when list-windows fails even when the provider probe succeeds", async () => {
    const run = vi.fn(async (args) => {
      if (args[0] === "-V") return { stdout: "tmux 3.6a\n", stderr: "" };
      if (args[0] === "has-session") return { stdout: "", stderr: "" };
      if (args[0] === "list-windows") throw Object.assign(new Error("list-windows failed"), { code: 1 });
      if (args[0] === "list-panes") return { stdout: panes, stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const result = await getTmuxTopology("/tmp/project", { runner: run, platform: "darwin" });
    expect(result.capabilities.topology).toBe(false);
    expect(result.session).toBeNull();
    expect(result.reason).toContain("topology is unsupported or failed");
  });

  it("reports a degraded psmux topology when list-commands is unavailable", async () => {
    const run = vi.fn(async (args) => {
      if (args[0] === "-V") return { stdout: "psmux 1.0\n", stderr: "" };
      if (args[0] === "has-session") return { stdout: "", stderr: "" };
      if (args[0] === "list-commands") throw new TmuxBrowserError("unsupported", "probe failed");
      if (args[0] === "list-windows") return { stdout: windows, stderr: "" };
      if (args[0] === "list-panes") return { stdout: panes, stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const result = await getTmuxTopology("/tmp/project", { runner: run, platform: "win32" });
    expect(result.capabilities.topology).toBe(true);
    expect(result.capabilities.selection).toBe(false);
    expect(result.capabilities.history).toBe(false);
    expect(result.reason).toContain("Capability probe failed");
  });

  it("identifies Windows providers as psmux", async () => {
    const result = await getTmuxTopology("C:\\project", { runner: runner(), platform: "win32" });
    expect(result.provider).toBe("psmux");
  });

  it("exposes a typed action catalog with reference-only entries and psmux degradation", () => {
    const tmuxEntries = getTmuxActionCatalog("tmux");
    const psmuxEntriesUnprobed = getTmuxActionCatalog("psmux"); // No probe results
    const psmuxEntriesProbed = getTmuxActionCatalog("psmux", new Set(["next-window", "select-pane"])); // With probe results

    expect(tmuxEntries.some((entry) => entry.id === "next-window" && entry.availability === "executable" && entry.shortcut === "Ctrl+B → n")).toBe(true);
    expect(tmuxEntries.some((entry) => entry.id === "kill-pane" && entry.availability === "reference-only" && entry.shortcut === "Ctrl+B → x")).toBe(true);
    expect(tmuxEntries.some((entry) => entry.id === "kill-session" && entry.shortcut === "Click Stop session")).toBe(true);

    // When psmux has no proven commands, all executable actions must be unsupported
    expect(psmuxEntriesUnprobed.some((entry) => entry.id === "next-window" && entry.supported)).toBe(false);
    expect(psmuxEntriesUnprobed.some((entry) => entry.id === "create-window" && entry.availability === "unsupported")).toBe(true);

    // When psmux has proven commands, supported actions are marked accordingly
    expect(psmuxEntriesProbed.some((entry) => entry.id === "next-window" && entry.supported)).toBe(true);
    expect(psmuxEntriesProbed.some((entry) => entry.id === "create-window" && entry.availability === "unsupported")).toBe(true);
  });

  it("executes only allowlisted actions and rejects destructive reference-only entries", async () => {
    const run = runner();
    const sessionName = resolvedTmuxSessionName("/tmp/project");

    await executeTmuxAction("/tmp/project", "next-window", { runner: run });
    expect(run).toHaveBeenCalledWith(["next-window", "-t", sessionName]);

    await executeTmuxAction("/tmp/project", "close-pane", { runner: run }, "%2");
    expect(run).toHaveBeenCalledWith(["kill-pane", "-t", "%2"]);
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(["kill-session", "-t", sessionName]));

    await executeTmuxAction("/tmp/project", "kill-session", { runner: run });
    expect(run).toHaveBeenCalledWith(["kill-session", "-t", sessionName]);

    await expect(executeTmuxAction("/tmp/project", "kill-pane", { runner: run })).rejects.toMatchObject({ kind: "unsupported" });
    await expect(executeTmuxAction("/tmp/project", "unknown-action", { runner: run })).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("uses distinct fixed command vectors for each executable action", async () => {
    const run = runner();
    const sessionName = resolvedTmuxSessionName("/tmp/project");
    const executableIds = [
      "next-window",
      "previous-window",
      "last-window",
      "pane-left",
      "pane-right",
      "pane-up",
      "pane-down",
      "create-window",
      "split-left",
      "split-right",
      "split-top",
      "split-bottom",
      "toggle-pane-zoom",
      "cycle-layout",
      "kill-session",
    ] as const;

    const expected: Record<typeof executableIds[number], readonly string[]> = {
      "next-window": ["next-window", "-t", sessionName],
      "previous-window": ["previous-window", "-t", sessionName],
      "last-window": ["last-window", "-t", sessionName],
      "pane-left": ["select-pane", "-L", "-t", "%1"],
      "pane-right": ["select-pane", "-R", "-t", "%1"],
      "pane-up": ["select-pane", "-U", "-t", "%1"],
      "pane-down": ["select-pane", "-D", "-t", "%1"],
      "create-window": ["new-window", "-t", sessionName],
      "split-left": ["split-window", "-h", "-b", "-t", `${sessionName}:0`],
      "split-right": ["split-window", "-h", "-t", `${sessionName}:0`],
      "split-top": ["split-window", "-v", "-b", "-t", `${sessionName}:0`],
      "split-bottom": ["split-window", "-v", "-t", `${sessionName}:0`],
      "toggle-pane-zoom": ["resize-pane", "-Z", "-t", "%1"],
      "cycle-layout": ["next-layout", "-t", `${sessionName}:0`],
      "kill-session": ["kill-session", "-t", sessionName],
    };

    for (const actionId of executableIds) {
      await executeTmuxAction("/tmp/project", actionId, { runner: run });
      expect(run).toHaveBeenLastCalledWith(expected[actionId]);
    }
  });

  it("probes psmux for available commands and disables unsupported actions", () => {
    // When all navigation commands are available
    const navigationAvailable = new Set(["next-window", "previous-window", "last-window", "select-pane"]);
    const catalog1 = getTmuxActionCatalog("psmux", navigationAvailable);
    expect(catalog1.find((e) => e.id === "next-window")?.supported).toBe(true);
    expect(catalog1.find((e) => e.id === "pane-left")?.supported).toBe(true);
    expect(catalog1.find((e) => e.id === "create-window")?.supported).toBe(false);

    // When select-pane is missing
    const limitedCommands = new Set(["next-window", "previous-window", "last-window"]);
    const catalog2 = getTmuxActionCatalog("psmux", limitedCommands);
    expect(catalog2.find((e) => e.id === "next-window")?.supported).toBe(true);
    expect(catalog2.find((e) => e.id === "pane-left")?.availability).toBe("unsupported");
    expect(catalog2.find((e) => e.id === "pane-left")?.supported).toBe(false);

    // When split commands are missing
    const noSplitCommands = new Set([
      "next-window", "previous-window", "last-window", "select-pane",
      "new-window", "resize-pane", "next-layout", "kill-pane", "kill-session",
    ]);
    const catalog3 = getTmuxActionCatalog("psmux", noSplitCommands);
    expect(catalog3.find((e) => e.id === "split-left")?.availability).toBe("unsupported");
    expect(catalog3.find((e) => e.id === "split-right")?.availability).toBe("unsupported");
    expect(catalog3.find((e) => e.id === "split-top")?.availability).toBe("unsupported");
    expect(catalog3.find((e) => e.id === "split-bottom")?.availability).toBe("unsupported");
  });

  it("disables all executable actions when psmux probe fails and no commands are proven", () => {
    // When availableCommands is undefined (probe failed), all server-executable actions must be unsupported
    const catalog = getTmuxActionCatalog("psmux", undefined);

    // All executable actions in the catalog must be marked unsupported and unavailable
    expect(catalog.find((e) => e.id === "next-window")?.supported).toBe(false);
    expect(catalog.find((e) => e.id === "next-window")?.availability).toBe("unsupported");
    expect(catalog.find((e) => e.id === "create-window")?.supported).toBe(false);
    expect(catalog.find((e) => e.id === "create-window")?.availability).toBe("unsupported");
    expect(catalog.find((e) => e.id === "split-left")?.supported).toBe(false);
    expect(catalog.find((e) => e.id === "split-left")?.availability).toBe("unsupported");
    expect(catalog.find((e) => e.id === "kill-session")?.supported).toBe(false);
    expect(catalog.find((e) => e.id === "kill-session")?.availability).toBe("unsupported");

    // But client-only and reference-only entries remain unchanged
    expect(catalog.find((e) => e.id === "refresh-topology")?.availability).toBe("client-only");
    expect(catalog.find((e) => e.id === "open-history")?.availability).toBe("client-only");
    expect(catalog.find((e) => e.id === "kill-pane")?.availability).toBe("reference-only");
    expect(catalog.find((e) => e.id === "kill-window")?.availability).toBe("reference-only");
  });

  it("executes action only when psmux has proven the required command via list-commands", async () => {
    const windows = "@1\t0\tmanager\t1\t1\tlayout-a\n";
    const panes = "%1\t@1\t0\t0\tManager\t1\t100\t30\t/tmp/project\n";

    // Mock runner: next-window is NOT in the available commands
    const commandsWithoutNavigation = new Set(["select-window", "select-pane"]);
    const run = vi.fn(async (args) => {
      const key = args[0];
      if (key === "-V") return { stdout: "psmux 1.0\n", stderr: "" };
      if (key === "has-session") return { stdout: "", stderr: "" };
      if (key === "list-windows") return { stdout: windows, stderr: "" };
      if (key === "list-panes") return { stdout: panes, stderr: "" };
      if (key === "list-commands") return { stdout: Array.from(commandsWithoutNavigation).join("\n") + "\n", stderr: "" };
      if (key === "next-window") throw new Error("next-window should not be invoked when not in available commands");
      return { stdout: "", stderr: "" };
    });

    // Try to execute next-window action on psmux without next-window in the proven commands
    await expect(
      executeTmuxAction("/tmp/project", "next-window", { runner: run, platform: "win32" })
    ).rejects.toMatchObject({ kind: "unsupported" });

    // Verify that next-window was never actually invoked
    const nextWindowCalls = run.mock.calls.filter((c) => c[0]?.[0] === "next-window");
    expect(nextWindowCalls).toHaveLength(0);
  });

  it("executes a supported psmux action when its command is proven via list-commands", async () => {
    const windows = "@1\t0\tmanager\t1\t1\tlayout-a\n";
    const panes = "%1\t@1\t0\t0\tManager\t1\t100\t30\t/tmp/project\n";

    // Mock runner: next-window IS in the available commands
    const commandsWithNavigation = new Set(["next-window", "select-window", "select-pane"]);
    const run = vi.fn(async (args) => {
      const key = args[0];
      if (key === "-V") return { stdout: "psmux 1.0\n", stderr: "" };
      if (key === "has-session") return { stdout: "", stderr: "" };
      if (key === "list-windows") return { stdout: windows, stderr: "" };
      if (key === "list-panes") return { stdout: panes, stderr: "" };
      if (key === "list-commands") return { stdout: Array.from(commandsWithNavigation).join("\n") + "\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });

    // Execute next-window action on psmux with next-window proven in available commands
    const result = await executeTmuxAction("/tmp/project", "next-window", { runner: run, platform: "win32" });
    expect(result.actionId).toBe("next-window");

    // Verify that next-window WAS invoked (should have been called once with the session target)
    const nextWindowCalls = run.mock.calls.filter((c) => c[0]?.[0] === "next-window");
    expect(nextWindowCalls.length).toBeGreaterThan(0);
  });

  it("rejects close-pane without proven kill-pane on psmux", async () => {
    const windows = "@1\t0\tmanager\t1\t1\tlayout-a\n";
    const panes = "%1\t@1\t0\t0\tManager\t1\t100\t30\t/tmp/project\n";

    // Mock runner: kill-pane is NOT in the available commands
    const commandsWithoutKillPane = new Set(["select-window", "select-pane"]);
    const run = vi.fn(async (args) => {
      const key = args[0];
      if (key === "-V") return { stdout: "psmux 1.0\n", stderr: "" };
      if (key === "has-session") return { stdout: "", stderr: "" };
      if (key === "list-windows") return { stdout: windows, stderr: "" };
      if (key === "list-panes") return { stdout: panes, stderr: "" };
      if (key === "list-commands") return { stdout: Array.from(commandsWithoutKillPane).join("\n") + "\n", stderr: "" };
      if (key === "kill-pane") throw new Error("kill-pane should not be invoked when not in available commands");
      return { stdout: "", stderr: "" };
    });

    // Try to close a pane on psmux without kill-pane in the proven commands
    await expect(
      executeTmuxAction("/tmp/project", "close-pane", { runner: run, platform: "win32" }, "%1")
    ).rejects.toMatchObject({ kind: "unsupported" });

    // Verify that kill-pane was never actually invoked
    const killPaneCalls = run.mock.calls.filter((c) => c[0]?.[0] === "kill-pane");
    expect(killPaneCalls).toHaveLength(0);
  });

  it("executes close-pane when kill-pane is proven on psmux", async () => {
    const windows = "@1\t0\tmanager\t1\t1\tlayout-a\n";
    const panes = "%1\t@1\t0\t0\tManager\t1\t100\t30\t/tmp/project\n";

    // Mock runner: kill-pane IS in the available commands
    const commandsWithKillPane = new Set(["select-window", "select-pane", "kill-pane"]);
    const run = vi.fn(async (args) => {
      const key = args[0];
      if (key === "-V") return { stdout: "psmux 1.0\n", stderr: "" };
      if (key === "has-session") return { stdout: "", stderr: "" };
      if (key === "list-windows") return { stdout: windows, stderr: "" };
      if (key === "list-panes") return { stdout: panes, stderr: "" };
      if (key === "list-commands") return { stdout: Array.from(commandsWithKillPane).join("\n") + "\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });

    // Close a pane on psmux with kill-pane proven in available commands
    const result = await executeTmuxAction("/tmp/project", "close-pane", { runner: run, platform: "win32" }, "%1");
    expect(result.actionId).toBe("close-pane");

    // Verify that kill-pane WAS invoked with the correct pane target
    const killPaneCalls = run.mock.calls.filter((c) => c[0]?.[0] === "kill-pane");
    expect(killPaneCalls.length).toBeGreaterThan(0);
    expect(killPaneCalls[0]?.[0]).toEqual(["kill-pane", "-t", "%1"]);
  });
});
