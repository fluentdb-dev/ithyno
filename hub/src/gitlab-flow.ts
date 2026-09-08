// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { HubConfig } from "./config.js";

export interface GitLabIssuePayload {
  projectPath: string;
  issueIid: string;
  title: string;
  body: string;
  labels: string[];
  eventAction?: string;
}

export interface GitLabClient {
  getDefaultBranch(projectPath: string): Promise<string>;
  getOpenSpecRevision(projectPath: string, branch: string): Promise<string>;
  getBranch(projectPath: string, branchName: string): Promise<{ name: string } | null>;
  createBranch(projectPath: string, branchName: string, ref: string): Promise<void>;
  commitAndPushFiles(projectPath: string, branchName: string, files: Array<{ path: string; content: string }>, commitMessage: string): Promise<void>;
  findMergeRequest(projectPath: string, issueIid: string, sourceBranch: string): Promise<{ iid: string; webUrl: string; draft: boolean; state: string } | null>;
  upsertMergeRequest(projectPath: string, issueIid: string, sourceBranch: string, targetBranch: string, title: string, description: string): Promise<{ iid: string; webUrl: string }>;
  findIssueComment(projectPath: string, issueIid: string, marker: string): Promise<{ id: string; body: string } | null>;
  upsertIssueComment(projectPath: string, issueIid: string, marker: string, body: string): Promise<void>;
  setIssueLabels?(projectPath: string, issueIid: string, labels: string[]): Promise<void>;
}

export interface GeneratedArtifacts {
  changeId: string;
  branchName: string;
  dirPath: string;
  proposalPath: string;
  tasksPath: string;
  specPath: string;
  proposalContent: string;
  tasksContent: string;
  specContent: string;
}

export function parseIssuePayload(body: Record<string, unknown>, projectId: string): GitLabIssuePayload | null {
  const objectKind = String((body.object_kind as string | undefined) ?? (body.event_type as string | undefined) ?? "").toLowerCase();
  if (objectKind !== "issue" && objectKind !== "work_item") return null;
  const objectAttributes = (body.object_attributes as Record<string, unknown> | undefined) ?? {};
  const issueIid = String(objectAttributes.iid ?? body.iid ?? "").trim();
  if (!issueIid) return null;
  const title = String(objectAttributes.title ?? body.title ?? "").trim();
  const bodyText = String(objectAttributes.description ?? objectAttributes.body ?? body.description ?? body.body ?? "").trim();
  const labels = normalizeLabels(objectAttributes.labels ?? body.labels ?? []);
  const projectDetails = (body.project as Record<string, unknown> | undefined) ?? {};
  const projectPath = String(projectId || projectDetails.path_with_namespace || projectDetails.path || "").trim();
  return {
    projectPath,
    issueIid,
    title,
    body: bodyText,
    labels,
    eventAction: String(objectAttributes.action ?? body.action ?? "").trim() || undefined,
  };
}

export async function processIssueGenerationJob(config: HubConfig, payload: GitLabIssuePayload, client: GitLabClient = config.gitlabClient ?? createDefaultGitLabClient()): Promise<GeneratedArtifacts | null> {
  const eligible = evaluateIssueEligibility(payload, config.aiSpecLabel);
  if (!eligible.ok) {
    const clarificationBody = buildClarificationComment(payload, eligible.reason ?? "missing-information");
    await client.upsertIssueComment(payload.projectPath, payload.issueIid, `${config.issueCommentMarker}:clarification`, clarificationBody);
    return null;
  }

  const changeId = await resolveChangeId(payload, client, config);
  const branchName = `${config.changeBranchPrefix}/${changeId}`;
  const defaultBranch = await client.getDefaultBranch(payload.projectPath).catch(() => config.defaultBranch);
  const baseRevision = await client.getOpenSpecRevision(payload.projectPath, defaultBranch).catch(() => `${defaultBranch}:unknown`);

  if (config.inProgressLabel && client.setIssueLabels) {
    await updateIssueLabels(payload, client, [config.inProgressLabel], []);
  }

  const artifacts = await generateArtifacts(changeId, payload, branchName, baseRevision, config);
  const validationErrors = validateArtifacts(artifacts);
  if (validationErrors.length > 0) {
    throw new Error(`generated artifacts invalid: ${validationErrors.join(", ")}`);
  }

  const existingBranch = await client.getBranch(payload.projectPath, branchName);
  if (!existingBranch) {
    await client.createBranch(payload.projectPath, branchName, defaultBranch);
  }

  await client.commitAndPushFiles(payload.projectPath, branchName, [
    { path: relativeToWorkspace(artifacts.proposalPath, config.workspaceRoot), content: artifacts.proposalContent },
    { path: relativeToWorkspace(artifacts.tasksPath, config.workspaceRoot), content: artifacts.tasksContent },
    { path: relativeToWorkspace(artifacts.specPath, config.workspaceRoot), content: artifacts.specContent },
  ], `agent: generate change ${changeId}`);

  const existingMergeRequest = await client.findMergeRequest(payload.projectPath, payload.issueIid, branchName);
  const mergeRequest = existingMergeRequest ?? await client.upsertMergeRequest(
    payload.projectPath,
    payload.issueIid,
    branchName,
    defaultBranch,
    `${config.changeBranchPrefix}/${changeId}`,
    buildMergeRequestDescription(changeId, payload, baseRevision),
  );

  const statusBody = buildStatusComment(changeId, branchName, mergeRequest.webUrl, baseRevision);
  await client.upsertIssueComment(payload.projectPath, payload.issueIid, `${config.issueCommentMarker}:status`, statusBody);
  return artifacts;
}

export async function applyIssueFlowFailure(config: HubConfig, payload: GitLabIssuePayload, error: unknown, client: GitLabClient = config.gitlabClient ?? createDefaultGitLabClient()): Promise<void> {
  const failureBody = buildFailureComment(payload, error);
  await client.upsertIssueComment(payload.projectPath, payload.issueIid, `${config.issueCommentMarker}:failure`, failureBody);
  if (config.terminalFailureLabel && client.setIssueLabels) {
    await updateIssueLabels(payload, client, [config.terminalFailureLabel], config.inProgressLabel ? [config.inProgressLabel] : []);
  }
}

export function evaluateIssueEligibility(payload: GitLabIssuePayload, aiSpecLabel: string): { ok: boolean; reason?: string } {
  const labels = payload.labels.map((label) => label.trim().toLowerCase());
  if (!labels.includes(aiSpecLabel.trim().toLowerCase())) {
    return { ok: false, reason: "missing-ai-spec-label" };
  }
  if (!payload.title.trim()) {
    return { ok: false, reason: "missing-title" };
  }
  if (!payload.body.trim()) {
    return { ok: false, reason: "missing-problem" };
  }
  return { ok: true };
}

export async function resolveChangeId(payload: GitLabIssuePayload, client: GitLabClient, config: HubConfig): Promise<string> {
  const baseSlug = toSlug(payload.title || payload.issueIid || "change");
  const baseId = `${payload.issueIid}-${baseSlug}`;
  const branchName = `${config.changeBranchPrefix}/${baseId}`;
  const existingBranch = await client.getBranch(payload.projectPath, branchName);
  if (existingBranch) return baseId;
  let candidate = baseId;
  let suffix = 1;
  while (await client.getBranch(payload.projectPath, `${config.changeBranchPrefix}/${candidate}`)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function generateArtifacts(changeId: string, payload: GitLabIssuePayload, branchName: string, baseRevision: string, config: HubConfig): Promise<GeneratedArtifacts> {
  const dirPath = resolve(config.workspaceRoot, changeId);
  const proposalPath = join(dirPath, "proposal.md");
  const tasksPath = join(dirPath, "tasks.md");
  const specPath = join(dirPath, "specs", "gitlab-hub", "spec.md");
  const proposalContent = buildProposalContent(changeId, payload, branchName, baseRevision);
  const tasksContent = buildTasksContent(changeId, payload);
  const specContent = buildSpecContent(changeId, payload);
  await mkdir(dirname(specPath), { recursive: true });
  await writeFile(proposalPath, proposalContent, "utf8");
  await writeFile(tasksPath, tasksContent, "utf8");
  await writeFile(specPath, specContent, "utf8");
  return {
    changeId,
    branchName,
    dirPath,
    proposalPath,
    tasksPath,
    specPath,
    proposalContent,
    tasksContent,
    specContent,
  };
}

export function validateArtifacts(artifacts: GeneratedArtifacts): string[] {
  const errors: string[] = [];
  if (!artifacts.proposalContent.includes("## Why")) errors.push("proposal missing Why section");
  if (!artifacts.proposalContent.includes("base-specs-revision")) errors.push("proposal missing base-specs-revision metadata");
  if (!artifacts.tasksContent.includes("- [ ]")) errors.push("tasks missing checklist items");
  if (!artifacts.specContent.includes("## ADDED Requirements")) errors.push("delta spec missing ADDED Requirements section");
  if (!artifacts.specContent.includes("### Requirement:")) errors.push("delta spec missing requirement block");
  return errors;
}

export function createDefaultGitLabClient(): GitLabClient {
  return {
    async getDefaultBranch() { return "main"; },
    async getOpenSpecRevision(_projectPath, branch) { return `${branch}:unknown`; },
    async getBranch() { return null; },
    async createBranch() {},
    async commitAndPushFiles() {},
    async findMergeRequest() { return null; },
    async upsertMergeRequest(_projectPath, _issueIid, _sourceBranch, _targetBranch, title, description) {
      const iid = `mr-${createHash("sha256").update(`${title}:${description}`).digest("hex").slice(0, 8)}`;
      return { iid, webUrl: `https://gitlab.example.com/merge_requests/${iid}` };
    },
    async findIssueComment() { return null; },
    async upsertIssueComment() {},
  };
}

function buildProposalContent(changeId: string, payload: GitLabIssuePayload, branchName: string, baseRevision: string): string {
  return `---
change-id: ${changeId}
issue: ${payload.issueIid}
branch: ${branchName}
base-specs-revision: ${baseRevision}
---

## Why
${payload.title}

## What Changes
- Create a deterministic OpenSpec change from the eligible Issue.
- Record the canonical branch and OpenSpec base revision in proposal metadata.
- Open one Draft merge request for human review.

## Impact
The hub records a reviewable OpenSpec change for ${payload.projectPath} and leaves implementation to later explicitly authorized stages.
`;
}

function buildTasksContent(changeId: string, payload: GitLabIssuePayload): string {
  return `# Change ${changeId}

- [ ] Review issue ${payload.issueIid} eligibility and context.
- [ ] Validate generated proposal, tasks, and delta specs.
- [ ] Open a Draft merge request for human review.
`;
}

function buildSpecContent(changeId: string, _payload: GitLabIssuePayload): string {
  return `## ADDED Requirements

### Requirement: Issue-driven OpenSpec change
The system SHALL create a deterministic OpenSpec change from an eligible Issue and persist the canonical branch and base spec revision in proposal metadata.

#### Scenario: Eligible Issue
- **WHEN** an Issue carries the configured ai:spec label and sufficient title/problem content
- **THEN** the hub creates ${changeId} and records the change for review.
`;
}

function buildClarificationComment(_payload: GitLabIssuePayload, reason: string): string {
  const detail = reason === "missing-title" ? "title" : reason === "missing-problem" ? "problem statement" : "title and problem statement";
  return `ithyno-hub: Please add a concise ${detail} so I can generate an OpenSpec change from this Issue.`;
}

function buildStatusComment(changeId: string, branchName: string, webUrl: string, baseRevision: string): string {
  return `ithyno-hub: Generated change ${changeId} on branch ${branchName}. Draft merge request: ${webUrl}. Base specs revision: ${baseRevision}.`;
}

function buildFailureComment(payload: GitLabIssuePayload, error: unknown): string {
  return `ithyno-hub: Change generation for Issue #${payload.issueIid} failed: ${error instanceof Error ? error.message : String(error)}`;
}

async function updateIssueLabels(payload: GitLabIssuePayload, client: GitLabClient, labelsToAdd: string[], labelsToRemove: string[]): Promise<void> {
  const nextLabels = mergeIssueLabels(payload.labels, labelsToAdd, labelsToRemove);
  await client.setIssueLabels?.(payload.projectPath, payload.issueIid, nextLabels);
}

function mergeIssueLabels(existingLabels: string[], labelsToAdd: string[], labelsToRemove: string[]): string[] {
  const normalizedToRemove = new Set(labelsToRemove.map((label) => normalizeLabelName(label)).filter(Boolean));
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const label of existingLabels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    const normalized = normalizeLabelName(trimmed);
    if (normalizedToRemove.has(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(trimmed);
  }
  for (const label of labelsToAdd) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    const normalized = normalizeLabelName(trimmed);
    if (normalizedToRemove.has(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(trimmed);
  }
  return merged;
}

function normalizeLabelName(value: string): string {
  return value.trim().toLowerCase();
}

function buildMergeRequestDescription(changeId: string, payload: GitLabIssuePayload, baseRevision: string): string {
  return `Draft OpenSpec change ${changeId} for Issue #${payload.issueIid}\n\nBase specs revision: ${baseRevision}`;
}

function normalizeLabels(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => typeof entry === "string" ? entry : String(entry ?? "")).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function toSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
  return normalized || "change";
}

function relativeToWorkspace(filePath: string, workspaceRoot: string): string {
  return relativePath(filePath, workspaceRoot);
}

function relativePath(filePath: string, workspaceRoot: string): string {
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const resolvedFilePath = resolve(filePath);
  const relative = resolvedFilePath.startsWith(resolvedWorkspaceRoot + "/")
    ? resolvedFilePath.slice(resolvedWorkspaceRoot.length + 1)
    : resolvedFilePath;
  return relative;
}
