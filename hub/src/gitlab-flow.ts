// SPDX-License-Identifier: GPL-3.0-or-later
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

class GitLabApiError extends Error {
  readonly status: number;
  readonly responseBody?: string;

  constructor(message: string, status: number, responseBody?: string) {
    super(message);
    this.name = "GitLabApiError";
    this.status = status;
    this.responseBody = responseBody;
  }
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

export async function processIssueGenerationJob(config: HubConfig, payload: GitLabIssuePayload, client: GitLabClient = config.gitlabClient ?? createDefaultGitLabClient(config)): Promise<GeneratedArtifacts | null> {
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

export async function applyIssueFlowFailure(config: HubConfig, payload: GitLabIssuePayload, error: unknown, client: GitLabClient = config.gitlabClient ?? createDefaultGitLabClient(config)): Promise<void> {
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

export async function resolveChangeId(payload: GitLabIssuePayload, _client: GitLabClient, _config: HubConfig): Promise<string> {
  const baseSlug = toSlug(payload.title || payload.issueIid || "change");
  return `${payload.issueIid}-${baseSlug}`;
}

export async function generateArtifacts(changeId: string, payload: GitLabIssuePayload, branchName: string, baseRevision: string, config: HubConfig): Promise<GeneratedArtifacts> {
  const dirPath = join(config.workspaceRoot, changeId);
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

export function createDefaultGitLabClient(config: HubConfig): GitLabClient {
  normalizeGitLabOrigin(config.gitlabOrigin);
  if (!config.gitlabToken?.trim()) {
    throw new Error("gitlab token is required for writes");
  }

  return {
    async getDefaultBranch(projectPath: string): Promise<string> {
      const payload = await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}`);
      const defaultBranch = String((payload as { default_branch?: string } | null)?.default_branch ?? "").trim();
      return defaultBranch || config.defaultBranch;
    },
    async getOpenSpecRevision(projectPath: string, branch: string): Promise<string> {
      const commits = await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}/repository/commits?ref_name=${encodeURIComponent(branch)}&path=openspec/specs&per_page=1`).catch((error: unknown) => {
        if (error instanceof GitLabApiError && error.status === 404) return [];
        throw error;
      });
      if (Array.isArray(commits) && commits.length > 0) {
        const first = commits[0] as { id?: string } | null;
        const commitId = first?.id ? String(first.id) : "";
        if (commitId) return `${branch}:${commitId}`;
      }
      const branchPayload = await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}/repository/branches/${encodeURIComponent(branch)}`).catch((error: unknown) => {
        if (error instanceof GitLabApiError && error.status === 404) return null;
        throw error;
      });
      const commitId = branchPayload && typeof branchPayload === "object"
        ? String((branchPayload as { commit?: { id?: string } }).commit?.id ?? "")
        : "";
      if (commitId) return `${branch}:${commitId}`;
      return `${branch}:unknown`;
    },
    async getBranch(projectPath: string, branchName: string): Promise<{ name: string } | null> {
      try {
        const payload = await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}/repository/branches/${encodeURIComponent(branchName)}`);
        return payload && typeof payload === "object" ? { name: String((payload as { name?: string }).name ?? branchName) } : null;
      } catch (error) {
        if (error instanceof GitLabApiError && error.status === 404) return null;
        throw error;
      }
    },
    async createBranch(projectPath: string, branchName: string, ref: string): Promise<void> {
      await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}/repository/branches`, {
        method: "POST",
        body: JSON.stringify({ branch: branchName, ref }),
      });
    },
    async commitAndPushFiles(projectPath: string, branchName: string, files: Array<{ path: string; content: string }>, commitMessage: string): Promise<void> {
      const actions: Array<{ action: string; file_path: string; content: string; encoding: string }> = [];
      for (const file of files) {
        const filePath = file.path;
        const existing = await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}/repository/files/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branchName)}`).catch((error: unknown) => {
          if (error instanceof GitLabApiError && error.status === 404) return null;
          throw error;
        });
        actions.push({
          action: existing ? "update" : "create",
          file_path: filePath,
          content: file.content,
          encoding: "text",
        });
      }
      await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}/repository/commits`, {
        method: "POST",
        body: JSON.stringify({
          branch: branchName,
          commit_message: commitMessage,
          actions,
        }),
      });
    },
    async findMergeRequest(projectPath: string, _issueIid: string, sourceBranch: string): Promise<{ iid: string; webUrl: string; draft: boolean; state: string } | null> {
      const payload = await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}/merge_requests?state=all&source_branch=${encodeURIComponent(sourceBranch)}&per_page=100`);
      if (!Array.isArray(payload)) return null;
      const existing = payload.find((entry: unknown) => {
        if (!entry || typeof entry !== "object") return false;
        const mergeRequest = entry as { source_branch?: string };
        return mergeRequest.source_branch === sourceBranch;
      });
      if (!existing || typeof existing !== "object") return null;
      const mergeRequest = existing as { iid?: number | string; web_url?: string; draft?: boolean; state?: string };
      return {
        iid: String(mergeRequest.iid ?? ""),
        webUrl: String(mergeRequest.web_url ?? ""),
        draft: Boolean(mergeRequest.draft),
        state: String(mergeRequest.state ?? ""),
      };
    },
    async upsertMergeRequest(projectPath: string, issueIid: string, sourceBranch: string, targetBranch: string, title: string, description: string): Promise<{ iid: string; webUrl: string }> {
      const existing = await this.findMergeRequest(projectPath, issueIid, sourceBranch);
      if (existing && existing.iid) {
        const payload = await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}/merge_requests/${encodeURIComponent(existing.iid)}`, {
          method: "PUT",
          body: JSON.stringify({
            title,
            description,
            draft: true,
          }),
        });
        return {
          iid: String((payload as { iid?: number | string } | null)?.iid ?? existing.iid),
          webUrl: String((payload as { web_url?: string } | null)?.web_url ?? existing.webUrl),
        };
      }
      const payload = await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}/merge_requests`, {
        method: "POST",
        body: JSON.stringify({
          source_branch: sourceBranch,
          target_branch: targetBranch,
          title,
          description,
          draft: true,
          remove_source_branch: false,
        }),
      });
      return {
        iid: String((payload as { iid?: number | string } | null)?.iid ?? ""),
        webUrl: String((payload as { web_url?: string } | null)?.web_url ?? ""),
      };
    },
    async findIssueComment(projectPath: string, issueIid: string, marker: string): Promise<{ id: string; body: string } | null> {
      const payload = await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}/issues/${encodeURIComponent(issueIid)}/notes?per_page=100`);
      if (!Array.isArray(payload)) return null;
      const comment = payload.find((entry: unknown) => {
        if (!entry || typeof entry !== "object") return false;
        const note = entry as { body?: string };
        return Boolean(note.body?.includes(marker));
      });
      if (!comment || typeof comment !== "object") return null;
      const note = comment as { id?: number | string; body?: string };
      return {
        id: String(note.id ?? ""),
        body: String(note.body ?? ""),
      };
    },
    async upsertIssueComment(projectPath: string, issueIid: string, marker: string, body: string): Promise<void> {
      const markerBody = `${marker}\n\n${body}`;
      const existing = await this.findIssueComment(projectPath, issueIid, marker);
      if (existing?.id) {
        await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}/notes/${encodeURIComponent(existing.id)}`, {
          method: "PUT",
          body: JSON.stringify({ body: markerBody }),
        });
        return;
      }
      await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}/issues/${encodeURIComponent(issueIid)}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: markerBody }),
      });
    },
    async setIssueLabels(projectPath: string, issueIid: string, labels: string[]): Promise<void> {
      await requestGitLab(config, `/projects/${encodeURIComponent(projectPath)}/issues/${encodeURIComponent(issueIid)}`, {
        method: "PUT",
        body: JSON.stringify({ labels: labels.join(",") }),
      });
    },
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

async function requestGitLab(config: HubConfig, path: string, init: { method?: string; body?: string } = {}): Promise<unknown> {
  const url = buildGitLabApiUrl(config, path);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "PRIVATE-TOKEN": config.gitlabToken?.trim() ?? "",
  };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, { method: init.method ?? "GET", body: init.body, headers });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new GitLabApiError(sanitizeErrorMessage(`gitlab request failed (${response.status}) for ${path}`), response.status, sanitizeErrorMessage(errorBody));
  }
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  const payload = JSON.parse(text) as unknown;
  validateGitLabResponsePayload(payload, config);
  return payload;
}

function buildGitLabApiUrl(config: HubConfig, path: string): URL {
  const base = normalizeGitLabOrigin(config.gitlabOrigin);
  const parsed = new URL(base);
  const prefix = parsed.pathname.replace(/\/+$/, "");
  const relativePath = path.startsWith("/") ? path : `/${path}`;
  const fullPath = `${prefix}/api/v4${relativePath}`;
  return new URL(`${parsed.protocol}//${parsed.host}${fullPath}`);
}

function normalizeGitLabOrigin(value: string): string {
  const parsed = new URL(value);
  if (!parsed.protocol.startsWith("http")) {
    throw new Error("gitlab origin must be an absolute http(s) URL");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function validateGitLabResponsePayload(payload: unknown, config: HubConfig): void {
  if (!payload || typeof payload !== "object") return;
  const root = payload as Record<string, unknown>;
  const candidateUrls = [root.web_url, root.http_url_to_repo, root.ssh_url_to_repo];
  if (root.project && typeof root.project === "object") {
    const project = root.project as Record<string, unknown>;
    candidateUrls.push(project.web_url);
  }
  for (const candidate of candidateUrls) {
    if (typeof candidate === "string") {
      validateGitLabTargetOrigin(candidate, config);
    }
  }
}

function validateGitLabTargetOrigin(targetUrl: string, config: HubConfig): void {
  try {
    const parsed = new URL(targetUrl);
    const expected = new URL(config.gitlabOrigin);
    if (parsed.origin !== expected.origin) {
      throw new Error(`gitlab target origin mismatch: ${parsed.origin}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("gitlab target origin mismatch")) {
      throw error;
    }
    throw new Error(`invalid gitlab target URL: ${targetUrl}`);
  }
}

function sanitizeErrorMessage(value: string): string {
  return value
    .replace(/PRIVATE-TOKEN:\s*[^\s,;]+/gi, "PRIVATE-TOKEN: [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/token[:=]\s*[^\s,;]+/gi, "token=[REDACTED]");
}
