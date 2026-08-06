// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Per-Agent CLI skill inspection and installation service.
 * (add-settings-agent-skill-installer)
 *
 * Provides two capabilities:
 *  - `inspectAgentSkills()` — report OpenSpec + ithyno state per CLI
 *  - `installAgentSkills()` — install selected components for one CLI
 *
 * The OpenSpec component spawns `npx openspec init <root> --tools <tool>`
 * using an executable + argument array (never a shell string). The ithyno
 * component calls the existing `installSkills()` renderer.
 *
 * A per-(projectRoot, cli) lock prevents duplicate concurrent installs.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  getRenderer,
  discoverSkillSourcesDetailed,
  installSkills,
  type CliId,
} from "./skill-renderer/index.js";
import { codexPromptContent, translateSkillBody } from "./skill-renderer/migrate-codex.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentSkillStatus =
  | "missing"
  | "partial"
  | "installed"
  | "update-available"
  | "unsupported";

export type AgentSkillComponent = "openspec" | "ithyno";

export interface ComponentInspection {
  status: AgentSkillStatus;
  diagnostics: string[];
  paths: string[];
}

export interface AgentSkillInfo {
  /** Doctor CLI key (e.g. "claude", "agy", "copilot") */
  cli: string;
  openspec: ComponentInspection;
  ithyno: ComponentInspection;
  inspectedAt: string;
}

export interface ComponentResult {
  status: "success" | "failed";
  error?: string;
}

export interface InstallAgentSkillsResult {
  result: "success" | "partial" | "failed";
  openspec?: ComponentResult;
  ithyno?: ComponentResult;
}

// ---------------------------------------------------------------------------
// CLI adapter table
// ---------------------------------------------------------------------------

/**
 * Maps each doctor CLI key to:
 *  - openspecTool: the --tools argument for `openspec init`
 *  - rendererCli: the CliId used by the skill-renderer
 *  - openspecPaths: representative project-local paths written by openspec init
 *    (used to classify installed/missing/partial — not exhaustive)
 *  - codexHome: when truthy, set CODEX_HOME=<projectRoot>/<codexHome> on spawn
 */
interface CliAdapter {
  openspecTool: string;
  rendererCli: CliId | null;
  openspecPaths: string[];
  codexHome?: string;
}

export const CLI_ADAPTERS: Record<string, CliAdapter> = {
  claude: {
    openspecTool: "claude",
    rendererCli: "claude",
    openspecPaths: [".claude/commands/opsx/propose.md", ".claude/commands/opsx/apply.md"],
  },
  codex: {
    openspecTool: "codex",
    rendererCli: "codex",
    openspecPaths: [".codex/prompts/opsx-propose.md", ".codex/prompts/opsx-apply.md"],
    codexHome: ".codex",
  },
  agy: {
    openspecTool: "antigravity",
    rendererCli: "antigravity",
    openspecPaths: [".agents/workflows/opsx-propose.md", ".agents/workflows/opsx-apply.md"],
  },
  copilot: {
    openspecTool: "github-copilot",
    rendererCli: "copilot",
    openspecPaths: [".github/prompts/opsx-propose.prompt.md", ".github/prompts/opsx-apply.prompt.md"],
  },
  gemini: {
    openspecTool: "gemini",
    rendererCli: "gemini",
    openspecPaths: [".gemini/commands/opsx/propose.toml", ".gemini/commands/opsx/apply.toml"],
  },
  opencode: {
    openspecTool: "opencode",
    rendererCli: "opencode",
    openspecPaths: [".opencode/commands/opsx-propose.md", ".opencode/commands/opsx-apply.md"],
  },
  cursor: {
    openspecTool: "cursor",
    rendererCli: "cursor",
    openspecPaths: [".cursor/commands/opsx-propose.md", ".cursor/commands/opsx-apply.md"],
  },
};

export interface OpenspecLayout {
  name: string;
  marker?: {
    path: string;
    value: string;
  };
  required: string[];
}

export const CLI_LAYOUTS: Record<string, OpenspecLayout[]> = {
  claude: [
    {
      name: "legacy-commands",
      required: [".claude/commands/opsx/propose.md", ".claude/commands/opsx/apply.md"],
    }
  ],
  codex: [
    {
      name: "skills-v1",
      marker: {
        path: ".agents/skills/.openspec-target",
        value: "codex",
      },
      required: [
        ".agents/skills/openspec-propose/SKILL.md",
        ".agents/skills/openspec-apply-change/SKILL.md",
      ],
    },
    {
      name: "legacy-prompts",
      required: [
        ".codex/prompts/opsx-propose.md",
        ".codex/prompts/opsx-apply.md",
      ],
    },
  ],
  agy: [
    {
      name: "skills-v1",
      required: [
        ".agent/skills/openspec-propose/SKILL.md",
        ".agent/skills/openspec-apply-change/SKILL.md",
      ],
    },
    {
      name: "legacy-workflows",
      required: [
        ".agents/workflows/opsx-propose.md",
        ".agents/workflows/opsx-apply.md",
      ],
    },
  ],
  copilot: [
    {
      name: "legacy-prompts",
      required: [
        ".github/prompts/opsx-propose.prompt.md",
        ".github/prompts/opsx-apply.prompt.md",
      ],
    }
  ],
  gemini: [
    {
      name: "legacy-commands",
      required: [
        ".gemini/commands/opsx/propose.toml",
        ".gemini/commands/opsx/apply.toml",
      ],
    }
  ],
  opencode: [
    {
      name: "legacy-commands",
      required: [
        ".opencode/commands/opsx-propose.md",
        ".opencode/commands/opsx-apply.md",
      ],
    }
  ],
  cursor: [
    {
      name: "legacy-commands",
      required: [
        ".cursor/commands/opsx-propose.md",
        ".cursor/commands/opsx-apply.md",
      ],
    }
  ],
};

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

function inspectOpenspecPaths(
  projectRoot: string,
  cli: string,
): ComponentInspection {
  const layouts = CLI_LAYOUTS[cli];
  if (!layouts || layouts.length === 0) {
    return { status: "unsupported", diagnostics: [], paths: [] };
  }

  for (const layout of layouts) {
    let markerMatches = true;
    if (layout.marker) {
      const markerPath = join(projectRoot, layout.marker.path);
      if (existsSync(markerPath)) {
        try {
          const val = readFileSync(markerPath, "utf-8").trim();
          if (val !== layout.marker.value) {
            markerMatches = false;
          }
        } catch {
          markerMatches = false;
        }
      } else {
        markerMatches = false;
      }
    }

    if (!markerMatches) continue;

    let foundCount = 0;
    for (const p of layout.required) {
      if (existsSync(join(projectRoot, p))) {
        foundCount++;
      }
    }

    if (foundCount === layout.required.length) {
      return {
        status: "installed",
        diagnostics: [],
        paths: layout.required,
      };
    }
  }

  let hasAnyFile = false;
  const allExpectedPaths: string[] = [];
  for (const layout of layouts) {
    for (const p of layout.required) {
      allExpectedPaths.push(p);
      if (existsSync(join(projectRoot, p))) {
        hasAnyFile = true;
      }
    }
  }

  if (hasAnyFile) {
    return {
      status: "partial",
      diagnostics: [`Partial installation detected. Expected files: ${allExpectedPaths.join(", ")}`],
      paths: allExpectedPaths,
    };
  }

  return {
    status: "missing",
    diagnostics: [`Missing all expected paths. Expected files: ${allExpectedPaths.join(", ")}`],
    paths: allExpectedPaths,
  };
}

async function inspectIthynoState(
  projectRoot: string,
  rendererCli: CliId,
  sourcesDir: string,
): Promise<ComponentInspection> {
  const renderer = getRenderer(rendererCli);
  if (!renderer) {
    return { status: "unsupported", diagnostics: ["No renderer found"], paths: [] };
  }

  const { sources } = await discoverSkillSourcesDetailed(sourcesDir);
  const paths: string[] = [];
  const missing: string[] = [];
  const outdated: string[] = [];
  let expectedCount = 0;

  for (const source of sources) {
    if (!source.manifest.supports.includes(rendererCli)) continue;
    let files: { path: string; content: string }[];
    try {
      files = renderer.render(source, { projectRoot, cli: rendererCli });
    } catch {
      continue;
    }
    for (const f of files) {
      expectedCount++;
      paths.push(f.path);
      const absPath = join(projectRoot, f.path);
      if (!existsSync(absPath)) {
        missing.push(f.path);
      } else {
        const existing = await readIfExists(absPath);
        let expectedContent = f.content;
        if (rendererCli === "codex") {
          if (f.path.startsWith(".codex/prompts/ithy-opsx-") && f.path.endsWith(".md")) {
            const command = f.path.slice(".codex/prompts/ithy-opsx-".length, -3);
            const claudeSource = join(projectRoot, ".claude", "commands", "ithy-opsx", `${command}.md`);
            if (existsSync(claudeSource)) {
              const raw = await readIfExists(claudeSource);
              if (raw !== null) {
                expectedContent = codexPromptContent(raw, command);
              }
            }
          } else if (f.path.startsWith(".codex/skills/ithy-opsx-") && f.path.endsWith("/SKILL.md")) {
            const parts = f.path.split("/");
            const skillName = parts[parts.length - 2];
            const claudeSource = join(projectRoot, ".claude", "skills", skillName, "SKILL.md");
            if (existsSync(claudeSource)) {
              const raw = await readIfExists(claudeSource);
              if (raw !== null) {
                expectedContent = translateSkillBody(raw);
              }
            }
          }
        }
        if (existing !== expectedContent) {
          outdated.push(f.path);
        }
      }
    }
  }

  if (expectedCount === 0) {
    return { status: "unsupported", diagnostics: ["No output files expected"], paths: [] };
  }

  let status: AgentSkillStatus;
  const diagnostics: string[] = [];

  if (missing.length === expectedCount) {
    status = "missing";
    diagnostics.push("Missing all expected files");
  } else if (missing.length > 0) {
    status = "partial";
    diagnostics.push(`Missing files: ${missing.join(", ")}`);
  } else if (outdated.length > 0) {
    status = "update-available";
    diagnostics.push(`Outdated files: ${outdated.join(", ")}`);
  } else {
    status = "installed";
  }

  return { status, diagnostics, paths };
}

/**
 * Inspect OpenSpec and ithyno skill state for every supported Agent CLI.
 * Failures in one CLI do not affect others.
 */
export async function inspectAgentSkills(
  projectRoot: string,
  sourcesDir: string,
  installedClis?: Record<string, { installed: boolean }>,
): Promise<AgentSkillInfo[]> {
  const now = new Date().toISOString();
  const results: AgentSkillInfo[] = [];

  for (const [cli, adapter] of Object.entries(CLI_ADAPTERS)) {
    const isCliInstalled = installedClis?.[cli]?.installed ?? false;
    if (!isCliInstalled) {
      results.push({
        cli,
        openspec: { status: "unsupported", diagnostics: ["CLI not installed"], paths: [] },
        ithyno: { status: "unsupported", diagnostics: ["CLI not installed"], paths: [] },
        inspectedAt: now,
      });
      continue;
    }

    const openspec = inspectOpenspecPaths(projectRoot, cli);

    let ithyno: ComponentInspection = {
      status: "unsupported",
      diagnostics: [],
      paths: [],
    };
    if (adapter.rendererCli) {
      try {
        ithyno = await inspectIthynoState(
          projectRoot,
          adapter.rendererCli,
          sourcesDir,
        );
      } catch (err) {
        ithyno = {
          status: "unsupported",
          diagnostics: [err instanceof Error ? err.message : String(err)],
          paths: [],
        };
      }
    }

    results.push({ cli, openspec, ithyno, inspectedAt: now });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------

/**
 * Per-(projectRoot, cli) lock. Concurrent requests for the same project+cli
 * get HTTP 409 from the route handler (it checks `isInstallLocked()` before
 * calling `installAgentSkills()`).
 */
const activeLocks = new Set<string>();

export function lockKey(projectRoot: string, cli: string): string {
  return `${projectRoot}\x00${cli}`;
}

export function isInstallLocked(projectRoot: string, cli: string): boolean {
  return activeLocks.has(lockKey(projectRoot, cli));
}

function acquireLock(projectRoot: string, cli: string): void {
  activeLocks.add(lockKey(projectRoot, cli));
}

function releaseLock(projectRoot: string, cli: string): void {
  activeLocks.delete(lockKey(projectRoot, cli));
}

/**
 * Run `npx openspec init <projectRoot> --tools <tool>` for the OpenSpec
 * component, streaming output via `onProgress`.
 */
async function runOpenspecInit(
  projectRoot: string,
  adapter: CliAdapter,
  onProgress: (event: string, data: unknown) => void,
): Promise<ComponentResult> {
  return new Promise((resolve) => {
    const extraEnv: Record<string, string> = adapter.codexHome
      ? { CODEX_HOME: join(projectRoot, adapter.codexHome) }
      : {};

    // Use npx to resolve the locally-installed openspec package.
    // Never use shell: true — argument array only.
    const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
    let child: ReturnType<typeof spawn>;
    try {
      child = _test_exports.spawn(
        cmd,
        ["openspec", "init", projectRoot, "--tools", adapter.openspecTool],
        {
          cwd: projectRoot,
          env: { ...process.env, ...extraEnv },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (err) {
      resolve({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line.trim()) onProgress("progress", { line });
      }
    });
    child.stderr?.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line.trim()) onProgress("progress", { line });
      }
    });

    child.on("error", (err) => {
      resolve({ status: "failed", error: err.message });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ status: "success" });
      } else {
        resolve({ status: "failed", error: `openspec init exited with code ${code ?? -1}` });
      }
    });
  });
}

/**
 * Install skills for one Agent CLI. Streams SSE events via `onProgress`.
 * Acquires the per-(projectRoot, cli) lock — callers MUST check
 * `isInstallLocked()` and return 409 before calling this function.
 *
 * @param cli Doctor CLI key, e.g. "claude", "agy"
 * @param components Which components to install
 * @param projectRoot Absolute path; always sourced from the server — never from the request
 * @param sourcesDir Absolute path to ithyno/skills/
 * @param onProgress Called for each SSE event
 */
export async function installAgentSkills(
  cli: string,
  components: AgentSkillComponent[],
  projectRoot: string,
  sourcesDir: string,
  onProgress: (event: string, data: unknown) => void,
): Promise<InstallAgentSkillsResult> {
  const adapter = CLI_ADAPTERS[cli];
  if (!adapter) {
    throw new Error(`unsupported CLI: ${cli}`);
  }

  acquireLock(projectRoot, cli);
  try {
    let openspecResult: ComponentResult | undefined;
    let ithynoResult: ComponentResult | undefined;

    // --- OpenSpec component ---
    if (components.includes("openspec")) {
      onProgress("progress", { line: `Installing OpenSpec skills for ${cli}…` });
      openspecResult = await runOpenspecInit(projectRoot, adapter, onProgress);
      if (openspecResult.status === "success") {
        const verify = inspectOpenspecPaths(projectRoot, cli);
        if (verify.status !== "installed") {
          openspecResult = {
            status: "failed",
            error: `OpenSpec verification failed: status is ${verify.status}. ${verify.diagnostics.join("; ")}`,
          };
        }
      }
      onProgress("component-result", {
        component: "openspec",
        status: openspecResult.status,
        ...(openspecResult.error ? { error: openspecResult.error } : {}),
      });
    }

    // --- ithyno component (continues even if openspec failed) ---
    if (components.includes("ithyno")) {
      if (!adapter.rendererCli) {
        ithynoResult = { status: "failed", error: "no ithyno renderer for this CLI" };
        onProgress("component-result", {
          component: "ithyno",
          status: "failed",
          error: ithynoResult.error,
        });
      } else {
        onProgress("progress", { line: `Installing ithyno skills for ${cli}…` });
        try {
          const res = await installSkills({
            projectRoot,
            selectedClis: [adapter.rendererCli],
            sourcesDir,
          });
          if (res.errors.length > 0) {
            const errorMsg = res.errors.map((e) => e.message).join("; ");
            ithynoResult = { status: "failed", error: errorMsg };
          } else {
            ithynoResult = { status: "success" };
          }
        } catch (err) {
          ithynoResult = {
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          };
        }
        onProgress("component-result", {
          component: "ithyno",
          status: ithynoResult.status,
          ...(ithynoResult.error ? { error: ithynoResult.error } : {}),
        });
      }
    }

    // --- Aggregate result ---
    const oSelected = components.includes("openspec");
    const iSelected = components.includes("ithyno");
    const oOk = openspecResult?.status === "success";
    const iOk = ithynoResult?.status === "success";

    let result: InstallAgentSkillsResult["result"];
    if (oSelected && iSelected) {
      if (oOk && iOk) result = "success";
      else if (!oOk && !iOk) result = "failed";
      else result = "partial";
    } else if (oSelected) {
      result = oOk ? "success" : "failed";
    } else if (iSelected) {
      result = iOk ? "success" : "failed";
    } else {
      result = "failed";
    }

    return {
      result,
      ...(openspecResult ? { openspec: openspecResult } : {}),
      ...(ithynoResult ? { ithyno: ithynoResult } : {}),
    };
  } finally {
    releaseLock(projectRoot, cli);
  }
}

export const _test_exports = {
  spawn,
};
