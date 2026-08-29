// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * ImportedProjectNotification — a persistent card shown when a Pattern-A
 * import (external target) completes.
 *
 * Lands in a top-right notification region rendered by App.tsx. The user
 * can click [Open imported project] to switch to the target project, or
 * [Dismiss] to remove the card.
 *
 * Landed by enable-import-both-patterns.
 */

import type { ImportedProjectNotification as NotificationData } from "../store";
import { isElectronShell } from "../runtime/electron";
import { isVsCodeShell } from "../runtime/shell";
import { writeClipboardText } from "../clipboardBridge";

type Props = {
  notification: NotificationData;
  onDismiss: (id: string) => void;
};

/**
 * Attempt to open the imported project directory in the host environment.
 *
 * - Electron: calls `window.ithyno.openProject(targetPath)` which triggers
 *   the main-process `openProject` IPC handler.
 * - VS Code: invokes `window.acquireVsCodeApi()` postMessage — deferred to
 *   a future follow-up (no `ithyno.switchWorkspace` command exists yet).
 * - Browser: copies the targetPath to the clipboard (fallback).
 */
async function openProject(targetPath: string): Promise<void> {
  const w = window as any;

  if (isElectronShell() && typeof w.ithyno?.openProject === "function") {
    w.ithyno.openProject(targetPath);
    return;
  }

  if (isVsCodeShell() && typeof w.ithyno?.switchWorkspace === "function") {
    w.ithyno.switchWorkspace(targetPath);
    return;
  }

  // Browser fallback: copy path to clipboard.
  try {
    await writeClipboardText(targetPath);
  } catch {
    /* ignore — clipboard might be unavailable in certain contexts */
  }
}

function isBrowserFallback(): boolean {
  const w = window as any;
  if (isElectronShell() && typeof w.ithyno?.openProject === "function") return false;
  if (isVsCodeShell() && typeof w.ithyno?.switchWorkspace === "function") return false;
  return true;
}

export function ImportedProjectNotification({ notification, onDismiss }: Props) {
  const { id, targetPath, completedAt } = notification;

  const time = new Date(completedAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const browserFallback = isBrowserFallback();
  const openLabel = browserFallback ? "Copy path" : "Open imported project";

  const handleOpen = () => {
    void openProject(targetPath);
  };

  const handleDismiss = () => {
    onDismiss(id);
  };

  return (
    <div className="imported-project-notification" role="status" aria-live="polite">
      <div className="imported-project-notification-body">
        <strong className="imported-project-notification-title">Import complete</strong>
        <span className="imported-project-notification-path" title={targetPath}>
          {targetPath}
        </span>
        <span className="imported-project-notification-time muted">at {time}</span>
      </div>
      <div className="imported-project-notification-actions">
        <button
          className="btn-primary btn-sm"
          onClick={handleOpen}
          title={browserFallback ? "Copy the path to clipboard" : `Open ${targetPath} as the active project`}
        >
          {openLabel}
        </button>
        <button
          className="btn-secondary btn-sm"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
