// SPDX-License-Identifier: GPL-3.0-or-later
import { join } from "node:path";
import type { GitLabClient } from "./gitlab-flow.js";

export interface HubConfig {
  host: string;
  port: number;
  gitlabOrigin: string;
  projectAllowlist: string[];
  botIdentity: string;
  webhookVerificationMode: "signed" | "legacy" | "none";
  webhookSecret: string;
  statePath: string;
  retentionMs: number;
  workstationSubscriptionCredential: string;
  gitlabToken?: string;
  gitlabClient?: GitLabClient;
  aiSpecLabel: string;
  defaultBranch: string;
  changeBranchPrefix: string;
  workspaceRoot: string;
  issueCommentMarker: string;
  inProgressLabel?: string;
  terminalFailureLabel?: string;
}

const DEFAULT_PORT = 4322;
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
function defaultPortValue(): number {
  return DEFAULT_PORT;
}
export function parseHubConfig(env: NodeJS.ProcessEnv = process.env): HubConfig {
  const port = Number(env.ITHYNO_HUB_PORT ?? defaultPortValue());
  const retentionDays = Number.parseInt(env.ITHYNO_HUB_RETENTION_DAYS ?? "", 10);
  const retentionMs = Number.parseInt(env.ITHYNO_HUB_RETENTION_MS ?? "", 10);
  const workspaceRoot = env.ITHYNO_HUB_WORKSPACE_ROOT ?? join(process.cwd(), ".hub-workspace");
  return {
    host: env.ITHYNO_HUB_HOST ?? "127.0.0.1",
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    gitlabOrigin: env.ITHYNO_GITLAB_ORIGIN ?? "https://gitlab.example.com",
    projectAllowlist: splitCsv(env.ITHYNO_GITLAB_PROJECT_ALLOWLIST ?? "group/project"),
    botIdentity: env.ITHYNO_HUB_BOT_IDENTITY ?? "ithyno-hub",
    webhookVerificationMode: parseVerificationMode(env.ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE),
    webhookSecret: env.ITHYNO_HUB_WEBHOOK_SECRET ?? "",
    statePath: env.ITHYNO_HUB_STATE_PATH ?? "/var/lib/ithyno-hub",
    retentionMs: Number.isFinite(retentionMs) && retentionMs > 0
      ? retentionMs
      : Number.isFinite(retentionDays) && retentionDays > 0
        ? retentionDays * 24 * 60 * 60 * 1000
        : DEFAULT_RETENTION_MS,
    workstationSubscriptionCredential: env.ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL ?? "change-me",
    gitlabToken: env.ITHYNO_GITLAB_TOKEN ?? undefined,
    aiSpecLabel: env.ITHYNO_GITLAB_AI_SPEC_LABEL ?? "ai:spec",
    defaultBranch: env.ITHYNO_GITLAB_DEFAULT_BRANCH ?? "main",
    changeBranchPrefix: env.ITHYNO_HUB_CHANGE_BRANCH_PREFIX ?? "change",
    workspaceRoot,
    issueCommentMarker: env.ITHYNO_HUB_ISSUE_COMMENT_MARKER ?? "ithyno-hub",
    inProgressLabel: env.ITHYNO_HUB_IN_PROGRESS_LABEL ?? "ai:in-progress",
    terminalFailureLabel: env.ITHYNO_HUB_FAILURE_LABEL ?? "ai:failed",
  };
}

export function validateHubConfig(config: HubConfig): string[] {
  const errors: string[] = [];
  if (!config.gitlabOrigin.startsWith("http")) errors.push("gitlab origin must be an absolute http(s) URL");
  if (config.projectAllowlist.length === 0) errors.push("project allowlist must include at least one project");
  if (!config.botIdentity.trim()) errors.push("bot identity must be explicitly configured");
  if (config.webhookVerificationMode === "none") {
    const isLocalDev = process.env.ITHYNO_DEV === "1" && isLoopbackHost(config.host);
    if (!isLocalDev) {
      errors.push("webhook verification mode none requires loopback host and dev mode");
    }
  } else if (!config.webhookSecret.trim()) {
    errors.push("webhook secret must be configured when verification is enabled");
  }
  if (!config.gitlabClient && !config.gitlabToken?.trim()) {
    errors.push("gitlab token must be configured when GitLab writes are enabled");
  }
  if (config.retentionMs <= 0) errors.push("retention period must be a positive duration");
  if (!config.workstationSubscriptionCredential || config.workstationSubscriptionCredential === "change-me") {
    errors.push("workstation subscription credential must be set to a non-default value");
  }
  return errors;
}

export function redactHubConfig(config: HubConfig): Record<string, unknown> {
  return {
    host: config.host,
    port: config.port,
    gitlabOrigin: config.gitlabOrigin,
    projectAllowlist: config.projectAllowlist,
    botIdentity: config.botIdentity,
    webhookVerificationMode: config.webhookVerificationMode,
    webhookSecret: "[REDACTED]",
    gitlabToken: config.gitlabToken ? "[REDACTED]" : undefined,
    statePath: config.statePath,
    retentionMs: config.retentionMs,
    workstationSubscriptionCredential: "[REDACTED]",
    aiSpecLabel: config.aiSpecLabel,
    defaultBranch: config.defaultBranch,
    changeBranchPrefix: config.changeBranchPrefix,
    workspaceRoot: config.workspaceRoot,
    issueCommentMarker: config.issueCommentMarker,
  };
}

function parseVerificationMode(value: string | undefined): HubConfig["webhookVerificationMode"] {
  switch (value?.toLowerCase()) {
    case "legacy":
      return "legacy";
    case "none":
      return "none";
    default:
      return "signed";
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1" || normalized.startsWith("127.");
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
