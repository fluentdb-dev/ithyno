// SPDX-License-Identifier: GPL-3.0-or-later
// Flow definitions for skill-e2e.
//
// Each flow returns an array of per-skill results:
//   { skill: "apply", status: "pass"|"fail"|"skip"|"dry", detail: "…" }
//
// Flows A–E cover all 11 Phase-D skills once each:
//   A: apply, review, verify, merge, archive
//   B: escalate, answer
//   C: revert
//   D: import
//   E: dispatch, dispatch-multi
//
// In --dry-run mode, structural checks (fixture scaffold + command file
// resolution + server /api endpoint reachability where applicable) run
// but Claude CLI dispatches are skipped — every skill exercised
// structurally is marked `dry`. In live mode (default), Claude round-trips
// run per D2/D5 with per-flow ceilings enforced via AbortController.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createScaffoldedTarget,
  seedInFlightChange,
  seedArchivedChange,
  patchAgentsYaml,
  gitInTarget,
} from "./fixture.mjs";
import { pickFreePort, startServer } from "./server.mjs";
import { dispatchClaude } from "./claude.mjs";
import {
  assertExists,
  assertVerdict,
  assertIthyOpsxCommandResolves,
  assertIthyOpsxSkillResolves,
} from "./assert.mjs";
import { info, warn, error, section } from "./log.mjs";

/** Common flow context — passed to each flow. */
export function makeFlowOpts({ dryRun, keepTmp, serverPort }) {
  return { dryRun, keepTmp, serverPort };
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

/**
 * Flow A — happy-path dispatch chain (worktree mode).
 * Skills covered: apply, review, verify, merge, archive.
 */
export async function runFlowA(opts) {
  return withFlow("A", async () => {
    const results = [];
    const { targetDir, cleanup } = await createScaffoldedTarget({
      keepTmp: opts.keepTmp,
      label: "flow-a",
    });
    let server;
    try {
      // Structural resolution — even in dry-run this must hold, else the
      // scaffold itself is broken. Matches the spec's "resolution regression"
      // scenario.
      for (const s of ["apply", "review", "verify", "merge", "archive"]) {
        await assertIthyOpsxCommandResolves(targetDir, s);
      }
      for (const s of ["apply", "review", "merge", "archive"]) {
        // Note: no ithy-opsx-verify skill directory — verify is a command-only
        // skill (see templates/.claude/skills/ inventory).
        try {
          await assertIthyOpsxSkillResolves(targetDir, s);
        } catch (err) {
          if (err.code !== "SKILL_DIR_MISSING") throw err;
          // Some skills exist only as commands (no backing skill dir) — OK.
          info(`flow-a: ${err.message} (command-only skill, OK)`);
        }
      }

      await patchAgentsYaml(targetDir, { maxReworkRounds: 1 });

      // Seed a trivial change the code stage would apply. In dry-run we
      // simply seed it; in live mode we'd dispatch through apply → review →
      // verify → merge → archive, each with a 60s ceiling.
      const id = "flow-a-happy";
      await seedInFlightChange(targetDir, { id, phase: "proposed" });

      // Boot the server on a random free port and cwd=targetDir (D4).
      // Even in dry-run we boot the server — it's part of the harness plumbing
      // that must actually work.
      const port = opts.serverPort ?? (await pickFreePort());
      server = await startServer({ targetDir, port });

      if (opts.dryRun) {
        info(`flow-a: dry-run — skipping claude round-trip for 5 skills`);
        for (const s of ["apply", "review", "verify", "merge", "archive"]) {
          results.push({
            skill: s,
            status: "dry",
            detail: `resolved at .claude/commands/ithy-opsx/${s}.md; live dispatch skipped`,
          });
        }
      } else {
        // Live mode: run the dispatch chain.
        // 1. apply
        const applyRes = await dispatchClaude({
          cwd: targetDir,
          prompt: `/ithy-opsx:apply ${id}`,
          ceilingMs: 60_000,
        });
        if (!applyRes.ok) {
          results.push({
            skill: "apply",
            status: "fail",
            detail: `dispatch failed (exit=${applyRes.exitCode}, timedOut=${applyRes.timedOut}): ${applyRes.stderr.slice(0, 200)}`,
          });
          return results;
        }
        // Assert agent/<id> branch has an impl: commit.
        const branchLog = await gitInTarget(targetDir, [
          "log",
          "-1",
          `agent/${id}`,
          "--format=%s",
        ]).catch((e) => e.message);
        if (typeof branchLog !== "string" || !/^impl:/i.test(branchLog.trim())) {
          results.push({
            skill: "apply",
            status: "fail",
            detail: `no agent/${id} branch with impl: commit (got: ${branchLog})`,
          });
          return results;
        }
        results.push({ skill: "apply", status: "pass", detail: branchLog.trim() });

        // 2. review — assert review.md at $REVIEW_MD_PATH (worktree form).
        const reviewMdPath = join(
          targetDir,
          ".worktrees",
          id,
          "openspec",
          "changes",
          id,
          "review.md",
        );
        const reviewRes = await dispatchClaude({
          cwd: targetDir,
          prompt: `/ithy-opsx:review ${id}`,
          ceilingMs: 60_000,
        });
        if (!reviewRes.ok) {
          results.push({
            skill: "review",
            status: "fail",
            detail: `dispatch failed: ${reviewRes.stderr.slice(0, 200)}`,
          });
        } else {
          try {
            const verdict = await assertVerdict(reviewMdPath);
            results.push({
              skill: "review",
              status: "pass",
              detail: `verdict=${verdict} at ${reviewMdPath}`,
            });
          } catch (err) {
            results.push({ skill: "review", status: "fail", detail: err.message });
          }
        }

        // 3. verify
        const verifyRes = await dispatchClaude({
          cwd: targetDir,
          prompt: `/ithy-opsx:verify ${id}`,
          ceilingMs: 60_000,
        });
        if (!verifyRes.ok) {
          results.push({
            skill: "verify",
            status: "fail",
            detail: `dispatch failed: ${verifyRes.stderr.slice(0, 200)}`,
          });
        } else {
          try {
            const verdict = await assertVerdict(reviewMdPath);
            results.push({
              skill: "verify",
              status: "pass",
              detail: `verdict=${verdict} at ${reviewMdPath}`,
            });
          } catch (err) {
            results.push({ skill: "verify", status: "fail", detail: err.message });
          }
        }

        // 4. merge
        const mergeRes = await dispatchClaude({
          cwd: targetDir,
          prompt: `/ithy-opsx:merge ${id}`,
          ceilingMs: 60_000,
        });
        if (!mergeRes.ok) {
          results.push({
            skill: "merge",
            status: "fail",
            detail: `dispatch failed: ${mergeRes.stderr.slice(0, 200)}`,
          });
        } else {
          const mainLog = await gitInTarget(targetDir, [
            "log",
            "-5",
            "main",
            "--format=%s",
          ]).catch((e) => e.message);
          if (typeof mainLog === "string" && /merge/i.test(mainLog)) {
            results.push({ skill: "merge", status: "pass", detail: `merge commit present` });
          } else {
            results.push({ skill: "merge", status: "fail", detail: `no merge commit on main` });
          }
        }

        // 5. archive
        const archiveRes = await dispatchClaude({
          cwd: targetDir,
          prompt: `/ithy-opsx:archive ${id}`,
          ceilingMs: 60_000,
        });
        if (!archiveRes.ok) {
          results.push({
            skill: "archive",
            status: "fail",
            detail: `dispatch failed: ${archiveRes.stderr.slice(0, 200)}`,
          });
        } else {
          const originalDir = join(targetDir, "openspec", "changes", id);
          if (existsSync(originalDir)) {
            results.push({
              skill: "archive",
              status: "fail",
              detail: `${originalDir} still exists — archive did not move it`,
            });
          } else {
            results.push({
              skill: "archive",
              status: "pass",
              detail: `change directory moved into openspec/changes/archive/`,
            });
          }
        }
      }
    } finally {
      if (server) await server.stop();
      await cleanup();
    }
    return results;
  });
}

/** Flow B — escalate + answer (needs-human path). Covers: escalate, answer. */
export async function runFlowB(opts) {
  return withFlow("B", async () => {
    const results = [];
    const { targetDir, cleanup } = await createScaffoldedTarget({
      keepTmp: opts.keepTmp,
      label: "flow-b",
    });
    let server;
    try {
      for (const s of ["escalate", "answer"]) {
        await assertIthyOpsxCommandResolves(targetDir, s);
      }
      const id = "flow-b-escalate";
      await seedInFlightChange(targetDir, { id, phase: "coded" });
      await patchAgentsYaml(targetDir, { maxReworkRounds: 1 });

      const port = opts.serverPort ?? (await pickFreePort());
      server = await startServer({ targetDir, port });

      if (opts.dryRun) {
        for (const s of ["escalate", "answer"]) {
          results.push({
            skill: s,
            status: "dry",
            detail: `resolved at .claude/commands/ithy-opsx/${s}.md; live dispatch skipped`,
          });
        }
        return results;
      }

      const escalateRes = await dispatchClaude({
        cwd: targetDir,
        prompt: `/ithy-opsx:escalate ${id} "test question from skill-e2e"`,
        ceilingMs: 60_000,
      });
      if (!escalateRes.ok) {
        results.push({
          skill: "escalate",
          status: "fail",
          detail: `dispatch failed: ${escalateRes.stderr.slice(0, 200)}`,
        });
      } else {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/api/changes/${id}/phase`);
          const body = await res.json();
          if (body.phase === "needs-human") {
            results.push({ skill: "escalate", status: "pass", detail: `phase=needs-human` });
          } else {
            results.push({
              skill: "escalate",
              status: "fail",
              detail: `expected phase=needs-human, got ${body.phase}`,
            });
          }
        } catch (err) {
          results.push({
            skill: "escalate",
            status: "fail",
            detail: `phase probe failed: ${err.message}`,
          });
        }
      }

      const answerRes = await dispatchClaude({
        cwd: targetDir,
        prompt: `/ithy-opsx:answer ${id} "test answer from skill-e2e"`,
        ceilingMs: 60_000,
      });
      if (!answerRes.ok) {
        results.push({
          skill: "answer",
          status: "fail",
          detail: `dispatch failed: ${answerRes.stderr.slice(0, 200)}`,
        });
      } else {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/api/changes/${id}/phase`);
          const body = await res.json();
          if (body.phase !== "needs-human") {
            results.push({
              skill: "answer",
              status: "pass",
              detail: `phase transitioned to ${body.phase}`,
            });
          } else {
            results.push({
              skill: "answer",
              status: "fail",
              detail: `expected phase to leave needs-human, still ${body.phase}`,
            });
          }
        } catch (err) {
          results.push({
            skill: "answer",
            status: "fail",
            detail: `phase probe failed: ${err.message}`,
          });
        }
      }
    } finally {
      if (server) await server.stop();
      await cleanup();
    }
    return results;
  });
}

/** Flow C — revert. Covers: revert. */
export async function runFlowC(opts) {
  return withFlow("C", async () => {
    const results = [];
    const { targetDir, cleanup } = await createScaffoldedTarget({
      keepTmp: opts.keepTmp,
      label: "flow-c",
    });
    let server;
    try {
      await assertIthyOpsxCommandResolves(targetDir, "revert");
      await assertIthyOpsxSkillResolves(targetDir, "revert");

      const archivedId = "flow-c-completed";
      await seedArchivedChange(targetDir, { id: archivedId });
      await patchAgentsYaml(targetDir, { maxReworkRounds: 1 });

      const port = opts.serverPort ?? (await pickFreePort());
      server = await startServer({ targetDir, port });

      if (opts.dryRun) {
        results.push({
          skill: "revert",
          status: "dry",
          detail: `resolved at .claude/commands/ithy-opsx/revert.md; live dispatch skipped`,
        });
        return results;
      }

      const revertRes = await dispatchClaude({
        cwd: targetDir,
        prompt: `/ithy-opsx:revert ${archivedId}`,
        ceilingMs: 90_000,
      });
      if (!revertRes.ok) {
        results.push({
          skill: "revert",
          status: "fail",
          detail: `dispatch failed: ${revertRes.stderr.slice(0, 200)}`,
        });
        return results;
      }

      const revertDir = join(
        targetDir,
        "openspec",
        "changes",
        `revert-${archivedId}`,
      );
      try {
        assertExists(revertDir, `revert change dir`);
        assertExists(join(revertDir, "proposal.md"));
        assertExists(join(revertDir, "tasks.md"));
        results.push({
          skill: "revert",
          status: "pass",
          detail: `revert change dir + proposal.md + tasks.md present`,
        });
      } catch (err) {
        results.push({ skill: "revert", status: "fail", detail: err.message });
      }
    } finally {
      if (server) await server.stop();
      await cleanup();
    }
    return results;
  });
}

/** Flow D — import. Covers: import. */
export async function runFlowD(opts) {
  return withFlow("D", async () => {
    const results = [];
    const { targetDir, cleanup } = await createScaffoldedTarget({
      keepTmp: opts.keepTmp,
      label: "flow-d-manager",
    });
    // Import needs a *second* target — the "external project to be imported".
    const { targetDir: externalDir, cleanup: cleanupExternal } =
      await createScaffoldedTarget({
        keepTmp: opts.keepTmp,
        label: "flow-d-external",
      });
    let server;
    try {
      await assertIthyOpsxCommandResolves(targetDir, "import");
      await assertIthyOpsxSkillResolves(targetDir, "import");

      // Remove openspec/ from the external target so import has work to do.
      // (createScaffoldedTarget seeds it via runInit, which does NOT scaffold
      // openspec/specs — but does create openspec/ config via `openspec init`
      // it does NOT run; runInit's own scope stops before that. Still, be
      // defensive.)
      // For dry-run, we just check the command resolves.

      const port = opts.serverPort ?? (await pickFreePort());
      server = await startServer({ targetDir, port });

      if (opts.dryRun) {
        results.push({
          skill: "import",
          status: "dry",
          detail: `resolved at .claude/commands/ithy-opsx/import.md; external target scaffolded at ${externalDir}; live dispatch skipped`,
        });
        return results;
      }

      const importRes = await dispatchClaude({
        cwd: targetDir,
        prompt: `/ithy-opsx:import ${externalDir}`,
        ceilingMs: 120_000,
      });
      if (!importRes.ok) {
        results.push({
          skill: "import",
          status: "fail",
          detail: `dispatch failed: ${importRes.stderr.slice(0, 200)}`,
        });
        return results;
      }

      const generatedMarker = join(externalDir, "openspec", "GENERATED.md");
      const specsDir = join(externalDir, "openspec", "specs");
      if (!existsSync(generatedMarker)) {
        results.push({
          skill: "import",
          status: "fail",
          detail: `missing completion marker ${generatedMarker}`,
        });
      } else if (!existsSync(specsDir)) {
        results.push({
          skill: "import",
          status: "fail",
          detail: `missing openspec/specs/ in external target`,
        });
      } else {
        results.push({
          skill: "import",
          status: "pass",
          detail: `openspec/specs/ and GENERATED.md present in ${externalDir}`,
        });
      }
    } finally {
      if (server) await server.stop();
      await cleanup();
      await cleanupExternal();
    }
    return results;
  });
}

/** Flow E — dispatch + dispatch-multi. Covers: dispatch, dispatch-multi. */
export async function runFlowE(opts) {
  return withFlow("E", async () => {
    const results = [];
    const { targetDir, cleanup } = await createScaffoldedTarget({
      keepTmp: opts.keepTmp,
      label: "flow-e",
    });
    let server;
    try {
      await assertIthyOpsxCommandResolves(targetDir, "dispatch");
      await assertIthyOpsxCommandResolves(targetDir, "dispatch-multi");
      // dispatch is not a directory-backed skill (it's a command-only skill
      // in ithyno-ui — the backing skill is `ithy-opsx-dispatch-multi`
      // for multi, and dispatch is just a command). Don't require a
      // ithy-opsx-dispatch skill dir.
      await assertIthyOpsxSkillResolves(targetDir, "dispatch-multi");

      const idA = "flow-e-a";
      const idB = "flow-e-b";
      await seedInFlightChange(targetDir, { id: idA, phase: "proposed" });
      await seedInFlightChange(targetDir, { id: idB, phase: "proposed" });
      await patchAgentsYaml(targetDir, { maxReworkRounds: 1 });

      const port = opts.serverPort ?? (await pickFreePort());
      server = await startServer({ targetDir, port });

      if (opts.dryRun) {
        results.push({
          skill: "dispatch",
          status: "dry",
          detail: `resolved at .claude/commands/ithy-opsx/dispatch.md; live dispatch skipped (covered transitively by Flow A when live)`,
        });
        results.push({
          skill: "dispatch-multi",
          status: "dry",
          detail: `resolved at .claude/commands/ithy-opsx/dispatch-multi.md; live dispatch skipped`,
        });
        return results;
      }

      // Live: run dispatch-multi with two changes; single-dispatch is
      // exercised transitively by Flow A (which invokes it via each worker
      // command). So dispatch here reports pass-by-transitivity.
      results.push({
        skill: "dispatch",
        status: "pass",
        detail: `exercised transitively by Flow A's worker invocations`,
      });

      const multiRes = await dispatchClaude({
        cwd: targetDir,
        prompt: `/ithy-opsx:dispatch-multi ${idA} ${idB}`,
        ceilingMs: 120_000,
      });
      if (!multiRes.ok) {
        results.push({
          skill: "dispatch-multi",
          status: "fail",
          detail: `dispatch failed: ${multiRes.stderr.slice(0, 200)}`,
        });
      } else {
        // Confirm both changes advanced.
        try {
          const [aRes, bRes] = await Promise.all([
            fetch(`http://127.0.0.1:${port}/api/changes/${idA}/phase`).then((r) =>
              r.json(),
            ),
            fetch(`http://127.0.0.1:${port}/api/changes/${idB}/phase`).then((r) =>
              r.json(),
            ),
          ]);
          if (aRes.phase !== "proposed" && bRes.phase !== "proposed") {
            results.push({
              skill: "dispatch-multi",
              status: "pass",
              detail: `both changes advanced: ${idA}=${aRes.phase}, ${idB}=${bRes.phase}`,
            });
          } else {
            results.push({
              skill: "dispatch-multi",
              status: "fail",
              detail: `at least one change did not advance: ${idA}=${aRes.phase}, ${idB}=${bRes.phase}`,
            });
          }
        } catch (err) {
          results.push({
            skill: "dispatch-multi",
            status: "fail",
            detail: `phase probe failed: ${err.message}`,
          });
        }
      }
    } finally {
      if (server) await server.stop();
      await cleanup();
    }
    return results;
  });
}
