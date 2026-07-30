// SPDX-License-Identifier: GPL-3.0-or-later
// Two-step "new project" chain: scaffold ithyno files (via runInit),
// then run `openspec init` as a subprocess. Emits ChainEvents so
// consumers (HTTP SSE endpoint, Electron main, VS Code extension host)
// can render progress.
//
// Never throws. Failures resolve `{ ok: false }` after emitting an
// `error` event.
//
// Landed by add-new-project-onboarding-window (2026-07-19).

import { spawn } from "node:child_process";
import { runInit } from "./init.js";

/**
 * @typedef {"scaffold" | "openspec-init"} Step
 * @typedef {{ type: "step-start", step: Step }
 *          | { type: "log", step: Step, line: string, stream: "stdout" | "stderr" }
 *          | { type: "step-done", step: Step }
 *          | { type: "complete", target: string }
 *          | { type: "error", step: Step, message: string }
 *          } ChainEvent
 */

/**
 * Split a chunk into lines, keeping the tail buffered across chunks so
 * we don't emit partial lines mid-stream. Returns the completed lines
 * and the new tail buffer.
 */
function splitLines(chunk, tail) {
  const combined = tail + chunk;
  const parts = combined.split(/\r?\n/);
  const nextTail = parts.pop() ?? "";
  return { lines: parts, tail: nextTail };
}

/**
 * Spawn a command, streaming stdout/stderr as "log" ChainEvents under
 * `step`, and resolve with its outcome. Shared by both npx and npm
 * invocations below.
 *
 * Windows has no bare "npx"/"npm" executable — only "npx.cmd"/"npm.cmd".
 * Node's spawn() refuses to run a .cmd file directly without shell:true
 * — recent Node versions throw EINVAL *synchronously* for this
 * (hardening after GHSA-9qxr-qj54-h672 / CVE-2024-27980, since
 * batch-file argv escaping isn't safe outside a shell). Confirmed live:
 * without shell:true this throw escaped uncaught from the Promise
 * executor, and — since nothing downstream ever caught it — the SSE
 * stream was simply left open forever with no further events, hanging
 * the whole onboarding chain. shell:true routes through cmd.exe, which
 * does the .cmd lookup and argv quoting correctly. POSIX doesn't need
 * any of this.
 *
 * @param {string} cmd base command name, e.g. "npx" or "npm" (no .cmd suffix)
 * @param {string[]} args
 * @param {string} cwd
 * @param {Step} step
 * @param {(e: ChainEvent) => void} onEvent
 * @returns {Promise<{ ok: boolean, code: number, message: string }>}
 */
function spawnStreamed(cmd, args, cwd, step, onEvent) {
  return new Promise((resolve) => {
    const winCmd = process.platform === "win32" ? `${cmd}.cmd` : cmd;
    let child;
    try {
      child = spawn(winCmd, args, {
        cwd,
        env: process.env,
        shell: process.platform === "win32",
      });
    } catch (err) {
      resolve({ ok: false, code: -1, message: err instanceof Error ? err.message : String(err) });
      return;
    }
    let stdoutTail = "";
    let stderrTail = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      const { lines, tail } = splitLines(chunk, stdoutTail);
      stdoutTail = tail;
      for (const line of lines) {
        onEvent({ type: "log", step, line, stream: "stdout" });
      }
    });
    child.stderr.on("data", (chunk) => {
      const { lines, tail } = splitLines(chunk, stderrTail);
      stderrTail = tail;
      for (const line of lines) {
        onEvent({ type: "log", step, line, stream: "stderr" });
      }
    });
    child.on("error", (err) => {
      resolve({ ok: false, code: -1, message: err.message });
    });
    child.on("close", (code) => {
      if (stdoutTail.length > 0) {
        onEvent({ type: "log", step, line: stdoutTail, stream: "stdout" });
      }
      if (stderrTail.length > 0) {
        onEvent({ type: "log", step, line: stderrTail, stream: "stderr" });
      }
      resolve({
        ok: code === 0,
        code: code ?? -1,
        message: code === 0 ? "" : `${cmd} ${args.join(" ")} exited with code ${code}`,
      });
    });
  });
}

/**
 * Map an ithyno CLI key (from `Cli` in server/doctor.ts) to the tool
 * name recognized by `openspec init --tools <t>`. openspec's tool list
 * covers more CLIs than we surface, but the ones ithyno's picker /
 * agents.yaml can name all map to a supported one. Falls back to
 * "claude" for unknown / undefined input so a mis-configured caller
 * still ends up with a working project.
 *
 * The rename from `agy` → `antigravity` and `copilot` →
 * `github-copilot` reflects openspec's naming — see
 * `openspec init --help`'s tool list.
 *
 * @param {string | undefined} cli
 * @returns {string}
 */
export function openspecToolForCli(cli) {
  switch (cli) {
    case "claude":
    case "codex":
    case "gemini":
    case "opencode":
    case "cursor":
    case "antigravity":
      return cli;
    case "agy":
      return "antigravity";
    case "copilot":
      return "github-copilot";
    default:
      return "claude";
  }
}

/**
 * @param {string} target
 * @param {(e: ChainEvent) => void} onEvent
 * @param {{ managerCli?: string }} [options]
 * @returns {Promise<{ ok: boolean, target: string }>}
 */
export async function runNewProjectChain(target, onEvent, options = {}) {
  // Step 1 — scaffold via runInit. quiet: false so per-file
  // create/skip/overwrite lines flow through the log callback; the
  // trailing "Next steps" hints are ignored by the onboarding UI
  // (which drives step 2 itself).
  onEvent({ type: "step-start", step: "scaffold" });
  let initResult;
  try {
    initResult = await runInit({
      targetDir: target,
      autoCreateDir: true,
      autoGitInit: true,
      quiet: false,
      log: (line) =>
        onEvent({ type: "log", step: "scaffold", line, stream: "stdout" }),
    });
  } catch (err) {
    onEvent({
      type: "error",
      step: "scaffold",
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, target };
  }
  if (!initResult.ok) {
    onEvent({
      type: "error",
      step: "scaffold",
      message: initResult.reason ?? "runInit failed",
    });
    return { ok: false, target };
  }
  onEvent({ type: "step-done", step: "scaffold" });

  // Step 2 — install `openspec` as a project-level devDependency BEFORE
  // running `openspec init`, so init itself uses the same resolvable
  // local install that stays behind afterward. Without this, every
  // OpenSpec-authored slash command (`/opsx:propose` etc., installed by
  // `openspec init` below) calls the bare `openspec` binary directly —
  // which resolves nowhere, since nothing installs it persistently
  // anywhere on PATH. A naive fallback of `npx openspec ...` (no pin)
  // doesn't help either: npx can't resolve an unscoped package literally
  // named "openspec" and fails with "could not determine executable to
  // run". Confirmed live on a fresh project — reproduces the exact
  // failure a user hit at /opsx:propose time. `npm install` auto-creates
  // package.json if one doesn't exist yet.
  onEvent({ type: "step-start", step: "openspec-init" });
  const finalTarget = initResult.target ?? target;
  const npmResult = await spawnStreamed(
    "npm",
    ["install", "--save-dev", "@fission-ai/openspec@latest"],
    finalTarget,
    "openspec-init",
    onEvent,
  );
  if (!npmResult.ok) {
    onEvent({
      type: "error",
      step: "openspec-init",
      message: npmResult.message,
    });
    return { ok: false, target: finalTarget };
  }

  // Step 3 — `openspec init`, now resolved from ./node_modules/.bin
  // (npx checks local node_modules/.bin before ever considering the
  // registry) instead of an ephemeral, separately-pinned npx fetch.
  // `--tools` is derived from the Manager CLI the caller picked (see
  // openspecToolForCli above). Prior to this the tool was hard-coded
  // "claude" — an agy / codex / etc pick still got a Claude scaffold
  // and the picked CLI had no AGENTS.md to read.
  const openspecTool = openspecToolForCli(options.managerCli);
  const result = await spawnStreamed(
    "npx",
    ["openspec", "init", finalTarget, "--tools", openspecTool],
    finalTarget,
    "openspec-init",
    onEvent,
  );
  if (!result.ok) {
    onEvent({
      type: "error",
      step: "openspec-init",
      message: result.message,
    });
    return { ok: false, target: finalTarget };
  }

  onEvent({ type: "step-done", step: "openspec-init" });
  onEvent({ type: "complete", target: finalTarget });
  return { ok: true, target: finalTarget };
}
