// Type declarations for bin/init.js — kept as JS so `npx ithyno init` runs
// without a build step, but consumers (tests, future TS callers) get types.

export function walkTemplates(rootDir: string): Promise<string[]>;

export function copyFile(args: {
  srcAbs: string;
  destAbs: string;
  force: boolean;
}): Promise<"create" | "skip" | "overwrite">;

export function updateGitignore(
  projectRoot: string,
  opts?: { disabled?: boolean },
): Promise<"appended" | "already-present" | "created" | "skipped">;

export interface RunInitResult {
  ok: boolean;
  exitCode: number;
  reason?: string;
  target?: string;
  actions?: Array<{ path: string; action: "create" | "skip" | "overwrite" }>;
  gitignoreResult?: "appended" | "already-present" | "created" | "skipped";
  summary?: { created: number; overwritten: number; skipped: number };
  openspecMissing?: boolean;
  gitInitPerformed?: boolean;
}

export function runInit(opts?: {
  targetDir?: string;
  force?: boolean;
  skipGitignore?: boolean;
  quiet?: boolean;
  autoCreateDir?: boolean;
  autoGitInit?: boolean;
  log?: (msg: string) => void;
  /** Manager CLI the user picked (e.g. `"claude"`, `"agy"`, `"codex"`).
   *  Undefined defaults to `"claude"` at the renderer invocation site
   *  when it lands (scaffold-ithy-opsx-skills-per-cli task 3). Threaded
   *  through here so all callers (server /api/init, /api/init/stream,
   *  runNewProjectChain) can pass the picker's choice without further
   *  signature churn. */
  managerCli?: string;
}): Promise<RunInitResult>;
