// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, sep, isAbsolute } from "node:path";
import { parseTasks, countProgress } from "./tasks.js";
import { parseSpec } from "./spec.js";
import { parseProposal } from "./proposal.js";
import type { Change, ChangeSummary, RawDoc, SpecDomain, WorkspaceState } from "../model.js";
import { readSidecar, extractSidecarFields } from "../sidecar.js";
import { parseNeedsHuman } from "../needs-human.js";
import { getGitStatus } from "../git/status.js";
import { readLock } from "../agents/worktree-lock.js";
import { hasAgentsYaml } from "../agents/registry.js";

/** Locate the openspec/ directory under a project root. */
export function resolveOpenspecDir(projectRoot: string): string | null {
  const direct = join(projectRoot, "openspec");
  if (existsSync(direct) && existsSync(join(direct, "changes"))) return direct;
  // Allow pointing directly at an openspec/ dir.
  if (existsSync(join(projectRoot, "changes"))) return projectRoot;
  return null;
}

async function listDirs(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function parseSpecsDir(specsDir: string): Promise<SpecDomain[]> {
  const out: SpecDomain[] = [];
  for (const domain of await listDirs(specsDir)) {
    const specPath = join(specsDir, domain, "spec.md");
    const content = await readIfExists(specPath);
    if (content != null) out.push(parseSpec(domain, specPath, content));
  }
  return out;
}

/** Read a change's worktree state — `.worktrees/<id>/` presence + its
 *  own tasks.md progress. Returns undefined when the worktree does not
 *  exist. Landed by collapse-jobregistry-and-add-semaphore for the
 *  folder-driven Kanban placement. */
async function readWorktreeState(
  projectRoot: string,
  id: string,
): Promise<Change["worktree"]> {
  const path = join(projectRoot, ".worktrees", id);
  if (!existsSync(path)) return undefined;
  const tasksPath = join(path, "openspec", "changes", id, "tasks.md");
  const tasksRaw = await readIfExists(tasksPath);
  const tasks = tasksRaw != null ? parseTasks(tasksPath, tasksRaw) : null;
  return {
    path,
    branch: `agent/${id}`,
    tasksProgress: countProgress(tasks),
  };
}

export async function parseChange(openspecDir: string, id: string): Promise<Change> {
  const dir = join(openspecDir, "changes", id);

  const proposalRaw = await readIfExists(join(dir, "proposal.md"));
  const designRaw = await readIfExists(join(dir, "design.md"));
  const tasksRaw = await readIfExists(join(dir, "tasks.md"));
  const hasOutcome = existsSync(join(dir, "outcome.md"));

  const tasks = tasksRaw != null ? parseTasks(join(dir, "tasks.md"), tasksRaw) : null;
  const design: RawDoc | null = designRaw != null ? { filePath: join(dir, "design.md"), raw: designRaw } : null;
  const proposal = proposalRaw != null ? parseProposal(join(dir, "proposal.md"), proposalRaw) : null;
  const deltaSpecs = await parseSpecsDir(join(dir, "specs"));

  // Sidecar-persisted workflow phase. `dirname(openspecDir)` is the project
  // root, which is the API the sidecar module expects.
  const projectRoot = dirname(openspecDir);
  const sidecarRaw = await readSidecar(projectRoot, id);
  const { phase, priorPhase, escalatedAt } = extractSidecarFields(sidecarRaw, id);

  // Surface the escalation question when the change is currently in
  // needs-human AND the artifact exists on disk. Reading it here means the
  // Kanban card can render the question without a separate fetch. When phase
  // is anything else the file is ignored — a lingering file from a past
  // escalation shouldn't render as a live question.
  let needsHumanQuestion: string | undefined;
  if (phase === "needs-human") {
    const doc = await parseNeedsHuman(projectRoot, id);
    if (doc?.question) needsHumanQuestion = doc.question;
  }

  const worktree = await readWorktreeState(projectRoot, id);

  return {
    id,
    proposal,
    design,
    tasks,
    deltaSpecs,
    progress: countProgress(tasks),
    hasOutcome,
    phase,
    priorPhase,
    escalatedAt,
    needsHumanQuestion,
    worktree,
  };
}

// Archive directories produced by the OpenSpec CLI are named `<YYYY-MM-DD>-<id>`.
// We split that here so the UI gets the canonical change id back, plus a date
// it can display.
const ARCHIVE_NAME_RE = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

async function changeSummary(archiveDir: string, dirName: string): Promise<ChangeSummary> {
  const m = ARCHIVE_NAME_RE.exec(dirName);
  const archivedAt = m ? m[1] : null;
  const id = m ? m[2] : dirName;
  const tasksRaw = await readIfExists(join(archiveDir, dirName, "tasks.md"));
  const tasks = tasksRaw != null ? parseTasks(join(archiveDir, dirName, "tasks.md"), tasksRaw) : null;
  const outcomeRaw = await readIfExists(join(archiveDir, dirName, "outcome.md"));
  const outcome = outcomeRaw != null ? { body: outcomeRaw } : null;
  return { id, progress: countProgress(tasks), archivedAt, outcome };
}

export async function scanWorkspace(
  openspecDir: string | null,
  projectRoot: string,
): Promise<WorkspaceState> {
  const gitStatus = await getGitStatus(projectRoot);
  const lock = await readLock(projectRoot);
  const agentsYaml = hasAgentsYaml(projectRoot);
  if (!openspecDir) {
    return { root: "", exists: false, specs: [], changes: [], archive: [], gitStatus, lock, hasAgentsYaml: agentsYaml };
  }

  const specs = await parseSpecsDir(join(openspecDir, "specs"));

  const changesDir = join(openspecDir, "changes");
  const changeIds = (await listDirs(changesDir)).filter((name) => name !== "archive");
  const changes = await Promise.all(changeIds.map((id) => parseChange(openspecDir, id)));

  const archiveDir = join(changesDir, "archive");
  const archiveIds = await listDirs(archiveDir);
  const archive = await Promise.all(archiveIds.map((id) => changeSummary(archiveDir, id)));

  changes.sort((a, b) => a.id.localeCompare(b.id));
  archive.sort((a, b) => b.id.localeCompare(a.id));

  return { root: openspecDir, exists: true, specs, changes, archive, gitStatus, lock, hasAgentsYaml: agentsYaml };
}

/**
 * Given an absolute file path, return the change id it belongs to (if any).
 * Uses OS-native path semantics so it works with Windows backslash paths too.
 */
export function changeIdForPath(openspecDir: string, filePath: string): string | null {
  const changesDir = join(openspecDir, "changes");
  const rel = relative(changesDir, filePath);
  // Outside changes/ if relative path escapes upward or is absolute.
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  const id = rel.split(sep)[0];
  if (!id || id === "archive") return null;
  return id;
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
