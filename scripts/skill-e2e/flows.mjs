// SPDX-License-Identifier: GPL-3.0-or-later
// Flow definitions for skill-e2e (structural-only).
//
// Each flow returns an array of per-skill results:
//   { skill: "apply", status: "pass"|"fail"|"skip", detail: "…" }
//
// Flows A–E cover all 11 Phase-D skills once each:
//   A: apply, review, verify, merge, archive
//   B: escalate, answer
//   C: revert
//   D: import
//   E: dispatch, dispatch-multi
//
// STRUCTURAL COVERAGE ONLY. This harness verifies:
//   1. Scaffolded target has the ithy-opsx command / skill files.
//   2. Server boots against the scaffolded target on port 4321.
//   3. Fixture setup (seed change / archived change / patched agents.yaml) works.
//
// It does NOT invoke Claude Code CLI. Live semantic verification of each
// skill (does /ithy-opsx:apply actually apply? does /ithy-opsx:escalate
// actually POST to /needs-human?) is done manually — see
// `docs/skill-e2e-manual-verification.md`. Rationale: `claude -p` mode
// interacts non-deterministically with slash commands that have
// interactive commit-approval steps (/ithy-opsx:apply and :archive both
// hang waiting for user input); an automated harness in that space
// produced too many false positives / negatives to be reliable. The
// dry-run structural coverage catches every regression class we saw in
// the earlier live-mode iteration EXCEPT semantic drift, which the
// manual verify-dispatch-e2e-N rounds cover as they always have.

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  createScaffoldedTarget,
  seedInFlightChange,
  seedArchivedChange,
  patchAgentsYaml,
} from "./fixture.mjs";
import { startServer } from "./server.mjs";
import {
  assertIthyOpsxCommandResolves,
  assertIthyOpsxSkillResolves,
} from "./assert.mjs";
import { info, error, section } from "./log.mjs";

/** Common flow context — passed to each flow. */
export function makeFlowOpts({ keepTmp, serverPort }) {
  return { keepTmp, serverPort };
}

/** Utility: safely run per-flow setup + teardown with structured result. */
async function withFlow(name, fn) {
  section(`Flow ${name}`);
  try {
    const results = await fn();
    return results;
  } catch (err) {
    error(`Flow ${name} threw: ${err.message}`);
    return [
      {
        skill: `flow-${name}`,
        status: "fail",
        detail: err.message,
      },
    ];
  }
}

/** For each of the given skills, assert command + optional skill dir
 *  resolve in the scaffolded target, then push a structural PASS. */
async function assertResolvesAndPass(targetDir, skills, results, opts = {}) {
  for (const skill of skills) {
    await assertIthyOpsxCommandResolves(targetDir, skill);
  }
  // Skill dirs — some skills are command-only (no backing skill dir); tolerate.
  if (opts.checkSkillDirs !== false) {
    for (const skill of skills) {
      try {
        await assertIthyOpsxSkillResolves(targetDir, skill);
      } catch (err) {
        if (err.code !== "SKILL_DIR_MISSING") throw err;
        info(`skill dir missing for ${skill} (command-only skill, OK)`);
      }
    }
  }
  for (const skill of skills) {
    results.push({
      skill,
      status: "pass",
      detail: `resolved at .claude/commands/ithy-opsx/${skill}.md; scaffold + server reachable`,
    });
  }
}

/** Flow A — apply/review/verify/merge/archive dispatch surface (structural). */
export async function runFlowA(opts) {
  return withFlow("A", async () => {
    const results = [];
    const { targetDir, cleanup } = await createScaffoldedTarget({
      keepTmp: opts.keepTmp,
      label: "flow-a",
    });
    let server;
    try {
      await patchAgentsYaml(targetDir, { maxReworkRounds: 1 });
      await seedInFlightChange(targetDir, {
        id: "flow-a-happy",
        phase: "proposed",
      });
      // Port 4321 matches what /ithy-opsx:escalate + :dispatch hard-code.
      // Consistent across flows so the manual verification steps line up.
      const port = opts.serverPort ?? 4321;
      server = await startServer({ targetDir, port });
      await assertResolvesAndPass(
        targetDir,
        ["apply", "review", "verify", "merge", "archive"],
        results,
      );
    } finally {
      if (server) await server.stop();
      await cleanup();
    }
    return results;
  });
}

/** Flow B — escalate + answer (needs-human path, structural). */
export async function runFlowB(opts) {
  return withFlow("B", async () => {
    const results = [];
    const { targetDir, cleanup } = await createScaffoldedTarget({
      keepTmp: opts.keepTmp,
      label: "flow-b",
    });
    let server;
    try {
      await patchAgentsYaml(targetDir, { maxReworkRounds: 1 });
      await seedInFlightChange(targetDir, {
        id: "flow-b-escalate",
        phase: "coded",
      });
      const port = opts.serverPort ?? 4321;
      server = await startServer({ targetDir, port });
      await assertResolvesAndPass(targetDir, ["escalate", "answer"], results);
    } finally {
      if (server) await server.stop();
      await cleanup();
    }
    return results;
  });
}

/** Flow C — revert (structural). */
export async function runFlowC(opts) {
  return withFlow("C", async () => {
    const results = [];
    const { targetDir, cleanup } = await createScaffoldedTarget({
      keepTmp: opts.keepTmp,
      label: "flow-c",
    });
    let server;
    try {
      await seedArchivedChange(targetDir, { id: "flow-c-completed" });
      await patchAgentsYaml(targetDir, { maxReworkRounds: 1 });
      const port = opts.serverPort ?? 4321;
      server = await startServer({ targetDir, port });
      await assertResolvesAndPass(targetDir, ["revert"], results);
    } finally {
      if (server) await server.stop();
      await cleanup();
    }
    return results;
  });
}

/** Flow D — import (structural). Needs a second target as the "external
 *  project to be imported" so the fixture matches the shape a maintainer
 *  would use in manual verification. */
export async function runFlowD(opts) {
  return withFlow("D", async () => {
    const results = [];
    const { targetDir, cleanup } = await createScaffoldedTarget({
      keepTmp: opts.keepTmp,
      label: "flow-d-manager",
    });
    const { targetDir: externalDir, cleanup: cleanupExternal } =
      await createScaffoldedTarget({
        keepTmp: opts.keepTmp,
        label: "flow-d-external",
      });
    let server;
    try {
      const port = opts.serverPort ?? 4321;
      server = await startServer({ targetDir, port });
      await assertResolvesAndPass(targetDir, ["import"], results);
      info(`flow-d: external target scaffolded at ${externalDir}`);
    } finally {
      if (server) await server.stop();
      await cleanup();
      await cleanupExternal();
    }
    return results;
  });
}

/** Flow E — dispatch + dispatch-multi (structural). */
export async function runFlowE(opts) {
  return withFlow("E", async () => {
    const results = [];
    const { targetDir, cleanup } = await createScaffoldedTarget({
      keepTmp: opts.keepTmp,
      label: "flow-e",
    });
    let server;
    try {
      await patchAgentsYaml(targetDir, { maxReworkRounds: 1 });
      await seedInFlightChange(targetDir, {
        id: "flow-e-a",
        phase: "proposed",
      });
      await seedInFlightChange(targetDir, {
        id: "flow-e-b",
        phase: "proposed",
      });
      const port = opts.serverPort ?? 4321;
      server = await startServer({ targetDir, port });
      await assertResolvesAndPass(
        targetDir,
        ["dispatch", "dispatch-multi"],
        results,
      );
    } finally {
      if (server) await server.stop();
      await cleanup();
    }
    return results;
  });
}
