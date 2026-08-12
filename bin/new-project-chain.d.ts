// Type declarations for bin/new-project-chain.js.

export type Step = "scaffold" | "openspec-init";
export type SpawnResult = { ok: boolean; code: number; message: string };

export type ChainEvent =
  | { type: "step-start"; step: Step }
  | {
      type: "log";
      step: Step;
      line: string;
      stream: "stdout" | "stderr";
    }
  | { type: "step-done"; step: Step }
  | { type: "complete"; target: string }
  | { type: "error"; step: Step; message: string };

export function openspecToolForCli(cli: string | undefined): string;

export function runNewProjectChain(
  target: string,
  onEvent: (e: ChainEvent) => void,
  options?: {
    managerCli?: string;
    spawnImpl?: (
      cmd: string,
      args: string[],
      cwd: string,
      step: Step,
      onEvent: (event: ChainEvent) => void,
      extraEnv?: Record<string, string>,
    ) => Promise<SpawnResult>;
  },
): Promise<{ ok: boolean; target: string }>;

export function normalizeCodexPromptNames(projectRoot: string): Promise<void>;
