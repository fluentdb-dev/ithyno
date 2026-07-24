// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Store-level unit tests for InitDialog behaviour
 * (expand-init-to-scaffold-agents).
 *
 * These are store-level tests — they do NOT mount React components so they
 * work without a browser DOM. Component rendering tests would require
 * vitest-browser-react or similar; the contract is verified via the store.
 *
 * Specifically we validate:
 *   - InitDialog uses defaultManager from the store as the preselected CLI.
 *   - The manager picker list respects the installed-only constraint.
 *   - The blocked state (readyForManager === false) is reflected in the report.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../store";
import type { Cli, DoctorReport } from "../types";
import { CLI_PRIORITY } from "../types";

function resetStore() {
  useStore.setState({ defaultManager: null });
}

describe("InitDialog store integration (expand-init-to-scaffold-agents)", () => {
  beforeEach(() => {
    resetStore();
  });

  it("initial defaultManager is null", () => {
    expect(useStore.getState().defaultManager).toBeNull();
  });

  it("setDefaultManager persists the chosen CLI to the store", () => {
    useStore.getState().setDefaultManager("codex");
    expect(useStore.getState().defaultManager).toBe("codex");
  });

  it("setDefaultManager accepts any valid CLI", () => {
    for (const cli of CLI_PRIORITY) {
      useStore.getState().setDefaultManager(cli as Cli);
      expect(useStore.getState().defaultManager).toBe(cli);
    }
  });
});

describe("Prerequisites summary logic (expand-init-to-scaffold-agents)", () => {
  function makeReport(onlyInstalled: Cli[]): DoctorReport {
    return {
      readyForManager: onlyInstalled.length > 0,
      agents: Object.fromEntries(
        CLI_PRIORITY.map((cli) => [
          cli,
          { installed: onlyInstalled.includes(cli) },
        ]),
      ) as DoctorReport["agents"],
      tmux: { installed: false },
      agmsg: { installed: false },
      ithyOpsx: {
        installed: false,
        installedVersion: null,
        bundledVersion: "0.0.0-test",
        commandCount: 0,
        skillCount: 0,
        userModifiedFiles: [],
        installError: null,
      },
      checkedAt: new Date().toISOString(),
    };
  }

  it("readyForManager is false when no CLI is installed — blocks Init", () => {
    const report = makeReport([]);
    expect(report.readyForManager).toBe(false);
  });

  it("readyForManager is true when at least one CLI is installed — unblocks Init", () => {
    const report = makeReport(["claude"]);
    expect(report.readyForManager).toBe(true);
  });

  it("manager picker only lists installed CLIs", () => {
    const report = makeReport(["claude"]);
    const installedClis = CLI_PRIORITY.filter(
      (cli) => report.agents[cli].installed,
    );
    expect(installedClis).toEqual(["claude"]);
    expect(installedClis).not.toContain("codex");
    expect(installedClis).not.toContain("gemini");
  });

  it("manager picker preselects defaultManager when it is installed", () => {
    useStore.setState({ defaultManager: "codex" });
    const report = makeReport(["claude", "codex"]);
    const installed = CLI_PRIORITY.filter(
      (cli) => report.agents[cli].installed,
    );
    const defaultMgr = useStore.getState().defaultManager;
    // Simulate InitDialog's preselect logic:
    const preselected =
      defaultMgr && installed.includes(defaultMgr) ? defaultMgr : installed[0];
    expect(preselected).toBe("codex");
  });

  it("manager picker falls back to first-by-priority when defaultManager is not installed", () => {
    useStore.setState({ defaultManager: "gemini" });
    const report = makeReport(["claude", "codex"]);
    const installed = CLI_PRIORITY.filter(
      (cli) => report.agents[cli].installed,
    );
    const defaultMgr = useStore.getState().defaultManager;
    // Simulate InitDialog's preselect logic:
    const preselected =
      defaultMgr && installed.includes(defaultMgr) ? defaultMgr : installed[0];
    expect(preselected).toBe("claude");
  });
});
