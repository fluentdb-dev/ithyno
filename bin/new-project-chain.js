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
 * @param {string} target
 * @param {(e: ChainEvent) => void} onEvent
 * @returns {Promise<{ ok: boolean, target: string }>}
 */
export async function runNewProjectChain(target, onEvent) {
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

  // Step 2 — spawn `npx openspec init`.
  onEvent({ type: "step-start", step: "openspec-init" });
  const finalTarget = initResult.target ?? target;
  const args = [
    "-y",
    "-p",
    "@fission-ai/openspec@latest",
    "openspec",
    "init",
    finalTarget,
    "--tools",
    "claude",
  ];
  const result = await new Promise((resolve) => {
    const child = spawn("npx", args, {
      cwd: finalTarget,
      env: process.env,
    });
    let stdoutTail = "";
    let stderrTail = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      const { lines, tail } = splitLines(chunk, stdoutTail);
      stdoutTail = tail;
      for (const line of lines) {
        onEvent({
          type: "log",
          step: "openspec-init",
          line,
          stream: "stdout",
        });
      }
    });
    child.stderr.on("data", (chunk) => {
      const { lines, tail } = splitLines(chunk, stderrTail);
      stderrTail = tail;
      for (const line of lines) {
        onEvent({
          type: "log",
          step: "openspec-init",
          line,
          stream: "stderr",
        });
      }
    });
    child.on("error", (err) => {
      resolve({ ok: false, code: -1, message: err.message });
    });
    child.on("close", (code) => {
      // Flush residual tails as final lines.
      if (stdoutTail.length > 0) {
        onEvent({
          type: "log",
          step: "openspec-init",
          line: stdoutTail,
          stream: "stdout",
        });
      }
      if (stderrTail.length > 0) {
        onEvent({
          type: "log",
          step: "openspec-init",
          line: stderrTail,
          stream: "stderr",
        });
      }
      resolve({
        ok: code === 0,
        code: code ?? -1,
        message: code === 0 ? "" : `openspec init exited with code ${code}`,
      });
    });
  });
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
