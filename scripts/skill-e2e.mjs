#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
//
// scripts/skill-e2e.mjs — structural harness for the /ithy-opsx:* surface.
//
// Purpose:
//   Prove every /ithy-opsx:* skill's *scaffold* + *server plumbing* survives
//   in a real Init'd target — one that received its .claude/commands/ithy-opsx/*
//   and .claude/skills/ithy-opsx-*/ via runInit(), not from the dev repo's
//   git checkout. Catches: files-not-copied, command-file-missing, server-
//   won't-boot, port-binding-broken, fixture-generator-broken. Complements
//   add-init-scaffold-smoke-test (files-land) and add-bundle-verification-
//   script (package-shape).
//
// What this harness does NOT do:
//   Live Claude CLI dispatch. `claude -p` mode interacts non-deterministically
//   with slash commands that have interactive commit-approval steps
//   (/ithy-opsx:apply, /ithy-opsx:archive), which produced too many false
//   positives / negatives for automation to be reliable. Semantic verification
//   is done manually per `docs/skill-e2e-manual-verification.md` — the same
//   pattern the `verify-dispatch-e2e-N` (rounds 1–6) manual runs used
//   historically.
//
// Gate:
//   Requires E2E=1 in the environment. Not part of `npm test`. Invoke via
//   `npm run e2e:skills` or `E2E=1 node scripts/skill-e2e.mjs`.
//
// Runtime: ~15s for all 5 flows on a reasonable dev machine.

import { runFlowA, runFlowB, runFlowC, runFlowD, runFlowE } from "./skill-e2e/flows.mjs";
import { info, warn, error, section } from "./skill-e2e/log.mjs";

// Every skill named in Phase D of the idea-doc. The harness MUST report each
// with pass / fail / skip — no silent gaps allowed.
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

const HELP_TEXT = `
scripts/skill-e2e.mjs — structural harness for /ithy-opsx:*

Usage:
  E2E=1 node scripts/skill-e2e.mjs [options]
  npm run e2e:skills [-- options]

What it checks (structural only):
  - Scaffolded target has every ithy-opsx command file resolvable.
  - Server boots against the scaffolded target on port 4321.
  - Fixture generators (seedInFlightChange, seedArchivedChange,
    patchAgentsYaml) work against the scaffolded target.

What it does NOT check:
  - Live Claude CLI dispatch of /ithy-opsx:* — that is manual, see
    docs/skill-e2e-manual-verification.md.

Options:
  --only <A|B|C|D|E>[,<...>]  Run only the named flow(s). Skipped flows'
                              skills are marked SKIP (does not affect exit).
  --keep-tmp                  Leave mkdtemp() targets on disk for post-mortem.
  --server-port <n>           Pin the ithyno server port (default: 4321,
                              matches what /ithy-opsx:escalate + :dispatch
                              hard-code).
  --help                      Show this help.

Flows and skill coverage (all structural):
  A  apply, review, verify, merge, archive
  B  escalate, answer
  C  revert
  D  import
  E  dispatch, dispatch-multi

Exit codes:
  0  every non-skipped skill's structural checks passed.
  1  at least one skill failed structurally (or the harness aborted).
  2  preflight failure (E2E not set).
`;

function parseArgs(argv) {
  const opts = {
    only: null,
    keepTmp: false,
    serverPort: null,
    help: false,
  };
  const argsList = argv.slice(2);
  for (let i = 0; i < argsList.length; i++) {
    const a = argsList[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--keep-tmp") opts.keepTmp = true;
    else if (a === "--only") opts.only = String(argsList[++i]).split(",").map((s) => s.trim().toUpperCase());
    else if (a === "--server-port") opts.serverPort = Number(argsList[++i]);
    else {
      warn(`unknown arg: ${a}`);
    }
  }
  return opts;
}

function summarize(results) {
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

  // Preflight: E2E=1 required. This is a soft-friction gate — the harness
  // would work if unset, but the invariant is that per-PR CI never runs it.
  if (process.env.E2E !== "1") {
    error(
      "E2E=1 not set. This harness is gated behind E2E=1 to keep it out of the standard test loop. " +
        "Set E2E=1 in your environment or invoke via `npm run e2e:skills`.",
    );
    process.exit(2);
  }

  info(
    `starting harness (keepTmp=${opts.keepTmp}, only=${opts.only ? opts.only.join(",") : "all"})`,
  );

  // Register cleanup on Ctrl-C so mid-flow interruption doesn't leak
  // tmpdirs / server subprocesses. Flow-local cleanup is defense in depth.
  process.on("SIGINT", () => {
    warn("SIGINT received — attempting graceful cleanup");
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

  const { anyFail } = summarize(allResults);
  section("Exit");
  if (anyFail) {
    error("At least one skill failed. Exiting 1.");
    process.exit(1);
  }
  info("All non-skipped skills passed. Exiting 0.");
  process.exit(0);
}

main().catch((err) => {
  error(`harness aborted: ${err.stack || err.message}`);
  process.exit(1);
});
