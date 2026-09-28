// SPDX-License-Identifier: GPL-3.0-or-later
type StoppableChild = {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  removeListener(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
};

/**
 * Give the ithyno server time to run its SIGTERM cleanup (including bridge
 * socket/descriptor removal), then force termination if it does not exit.
 */
export function stopChildProcess(
  child: StoppableChild,
  graceMs = 2_000,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve();
    };
    const onExit = () => finish();

    child.once("exit", onExit);
    timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          // The process may have exited between the state check and kill().
        }
      }
      finish();
    }, graceMs);

    try {
      child.kill("SIGTERM");
    } catch {
      finish();
    }
  });
}
