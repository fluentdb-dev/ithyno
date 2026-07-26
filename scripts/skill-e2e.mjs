#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
//
// scripts/skill-e2e.mjs — scaffolded-target skill-e2e harness for /ithy-opsx:*.
//
// Purpose:
//   Prove every /ithy-opsx:* skill resolves AND behaves end-to-end in a
//   real scaffolded target — one that received its .claude/commands/
//   ithy-opsx/* and .claude/skills/ithy-opsx-*/ via runInit(), not from the
//   dev repo's git checkout. This closes the gap left by add-init-scaffold-
//   smoke-test (files-land) and add-bundle-verification-script (package-shape):
//   the harness catches file-present-but-behaviorally-broken regressions
//   (contract drift, endpoint removal, prompt reshape).
//
// Gate:
//   Requires E2E=1 in the environment. Not part of `npm test`. Invoke via
//   `npm run e2e:skills` or `E2E=1 node scripts/skill-e2e.mjs`.
//
// Prerequisites:
//   - `claude` CLI on $PATH and authenticated (unless --dry-run).
//   - `node` (host) and git.
//
// Design decisions (see openspec/changes/add-skill-e2e-harness/design.md):
//   D1 standalone script, not Vitest.  D2 real Claude CLI, not stub (live
//   mode).  D3 one scaffolded target per flow.  D4 subprocess-spawned
//   server, not in-process import.  D5 `claude -p` boot-prompt, not PTY.
//   D6 fixture regenerated per invocation from runInit(), not checked in.
//   D7 5 flows covering all 11 skills, not 66 permutations.
//
// Coverage matrix (Phase D of docs/ideas/2026-07-26-comprehensive-skill-test-plan.md):
//   Flow A: apply, review, verify, merge, archive  (happy-path dispatch chain)
//   Flow B: escalate, answer                         (needs-human path)
//   Flow C: revert                                    (Case α revert)
//   Flow D: import                                    (external target)
//   Flow E: dispatch, dispatch-multi                 (orchestrators)
//
// Runtime target: <3 min for full live matrix on a reasonable dev machine.
// Dry-run mode: <5s (structural only, skips Claude round-trips).

import { runFlowA, runFlowB, runFlowC, runFlowD, runFlowE } from "./skill-e2e/flows.mjs";
import { preflightClaude } from "./skill-e2e/claude.mjs";
import { info, warn, error, section } from "./skill-e2e/log.mjs";

// Every skill named in Phase D of the idea-doc. The harness MUST report each
// with pass / fail / skip / dry — no silent gaps allowed (task 10.2).
const PHASE_D_SKILLS = [
  "apply",
  "review",
  "verify",
  "merge",
  "archive",
  "revert",
  "import",
  "escalate",
  "answer",
  "dispatch",
  "dispatch-multi",
];

const FLOW_TO_SKILLS = {
  A: ["apply", "review", "verify", "merge", "archive"],
  B: ["escalate", "answer"],
  C: ["revert"],
  D: ["import"],
  E: ["dispatch", "dispatch-multi"],
};

const HELP_TEXT = `
scripts/skill-e2e.mjs — scaffolded-target skill-e2e harness for /ithy-opsx:*

Usage:
  E2E=1 node scripts/skill-e2e.mjs [options]
  npm run e2e:skills [-- options]

Options:
  --only <A|B|C|D|E>[,<...>]  Run only the named flow(s). Skipped flows'
                              skills are marked SKIP in the summary (does
                              not affect exit code).
  --dry-run                   Skip Claude CLI round-trips. Structural
                              checks (fixture scaffold, command resolution,
                              server boot) still run. Skills exercised
                              structurally are marked DRY. Useful for CI
                              / smoke checks that don't need a live Claude
                              account. Exit 0 iff every non-skipped flow's
                              structural checks pass.
  --keep-tmp                  Leave mkdtemp() targets on disk for post-mortem.
                              Reports the paths in the summary.
  --server-port <n>           Pin the ithyno server port (default: random
                              free port). Only useful when reproducing a
                              specific bug; leave unset otherwise.
  --help                      Show this help.

Flows and skill coverage:
  A (default port random)  apply, review, verify, merge, archive
  B                        escalate, answer
  C                        revert
  D                        import
  E                        dispatch, dispatch-multi

Prerequisites:
  - Claude Code CLI (claude) on \$PATH and authenticated for live mode.
    In --dry-run mode, the CLI is not invoked.
  - node ≥18 (uses global fetch), git.

Exit codes:
  0  every non-skipped skill passed or ran DRY successfully.
  1  at least one skill failed (or the harness aborted).
  2  preflight failure (E2E not set, claude missing in live mode, etc.).
`;

function parseArgs(argv) {
  const opts = {
    only: null,
    dryRun: false,
    keepTmp: false,
    serverPort: null,
    help: false,
  };
  const argsList = argv.slice(2);
  for (let i = 0; i < argsList.length; i++) {
    const a = argsList[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--keep-tmp") opts.keepTmp = true;
    else if (a === "--only") opts.only = String(argsList[++i]).split(",").map((s) => s.trim().toUpperCase());
    else if (a === "--server-port") opts.serverPort = Number(argsList[++i]);
    else {
      warn(`unknown arg: ${a}`);
    }
  }
  return opts;
}

function summarize(results, opts) {
  section("Skill coverage summary");
  const bySkill = new Map();
  for (const r of results) bySkill.set(r.skill, r);

  // Every Phase D skill must appear in the summary — either from an actual
  // result or as SKIP if the flow was excluded via --only.
  let anyFail = false;
  const rows = [];
  for (const skill of PHASE_D_SKILLS) {
    const r = bySkill.get(skill);
    let status = "SKIP";
    let detail = "not exercised (flow skipped or not run)";
    if (r) {
      status = r.status.toUpperCase();
      detail = r.detail || "";
      if (r.status === "fail") anyFail = true;
    }
    rows.push({ skill, status, detail });
  }

  const maxSkill = Math.max(...rows.map((r) => r.skill.length));
  const maxStatus = Math.max(...rows.map((r) => r.status.length));
  for (const r of rows) {
    console.log(
      `  ${r.skill.padEnd(maxSkill)}  ${r.status.padEnd(maxStatus)}  ${r.detail}`,
    );
  }

  // Also surface any raw flow-level failures (e.g., a flow crashed before
  // producing per-skill results).
  const flowFailures = results.filter((r) => r.skill?.startsWith("flow-"));
  if (flowFailures.length) {
    console.log("");
    console.log("Flow-level failures:");
    for (const f of flowFailures) {
      console.log(`  ${f.skill}  ${f.status.toUpperCase()}  ${f.detail}`);
      if (f.status === "fail") anyFail = true;
    }
  }

  return { anyFail };
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Preflight: E2E=1 required (task 2.2). This is a soft-friction gate — the
  // harness would work if unset, but the invariant is that per-PR CI never
  // runs it. The gate makes "did you mean to invoke this?" explicit.
  if (process.env.E2E !== "1") {
    error(
      "E2E=1 not set. This harness is gated behind E2E=1 to keep it out of the standard test loop. " +
        "Set E2E=1 in your environment or invoke via `npm run e2e:skills`.",
    );
    process.exit(2);
  }

  info(
    `starting harness (dryRun=${opts.dryRun}, keepTmp=${opts.keepTmp}, only=${opts.only ? opts.only.join(",") : "all"})`,
  );

  // Preflight: claude --version (task 2.2). Skipped in dry-run.
  if (!opts.dryRun) {
    try {
      const version = await preflightClaude();
      info(`claude preflight OK: ${version.split(/\r?\n/)[0]}`);
    } catch (err) {
      error(err.message);
      process.exit(2);
    }
  } else {
    info(`claude preflight skipped (--dry-run)`);
  }

  // Register cleanup on Ctrl-C so mid-flow interruption doesn't leak
  // tmpdirs / server subprocesses (task 3.3). Flow-local cleanup is defense
  // in depth; this is the outer guard.
  process.on("SIGINT", () => {
    warn("SIGINT received — attempting graceful cleanup");
    // Individual flows install their own SIGTERM handlers on server children.
    // We just exit; the OS will reap any orphans.
    process.exit(130);
  });

  const runFlows = opts.only ?? ["A", "B", "C", "D", "E"];
  const allResults = [];
  for (const name of ["A", "B", "C", "D", "E"]) {
    if (!runFlows.includes(name)) {
      info(`Flow ${name}: SKIPPED (--only)`);
      continue;
    }
    let flowResults;
    switch (name) {
      case "A":
        flowResults = await runFlowA(opts);
        break;
      case "B":
        flowResults = await runFlowB(opts);
        break;
      case "C":
        flowResults = await runFlowC(opts);
        break;
      case "D":
        flowResults = await runFlowD(opts);
        break;
      case "E":
        flowResults = await runFlowE(opts);
        break;
    }
    allResults.push(...flowResults);
  }

  const { anyFail } = summarize(allResults, opts);
  section("Exit");
  if (anyFail) {
    error("At least one skill failed. Exiting 1.");
    process.exit(1);
  }
  info("All non-skipped skills passed (or ran DRY successfully). Exiting 0.");
  process.exit(0);
}

main().catch((err) => {
  error(`harness aborted: ${err.stack || err.message}`);
  process.exit(1);
});
