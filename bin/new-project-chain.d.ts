// Type declarations for bin/new-project-chain.js.

export type Step = "scaffold" | "openspec-init";

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

export function runNewProjectChain(
  target: string,
  onEvent: (e: ChainEvent) => void,
): Promise<{ ok: boolean; target: string }>;
