import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installClaudeNotifyHook, installCodexNotifyHook, codexNotifyHookStatus, removeCodexNotifyHook, installCopilotNotifyHook, copilotNotifyHookStatus, removeCopilotNotifyHook, platformNotifyScript, scaffoldNotifyScript } from "../bin/init.js";

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function tempRoot() { const root = await mkdtemp(join(tmpdir(), "ithyno-init-")); roots.push(root); return root; }

describe("notification init helpers", () => {
  it("selects host scripts and skips unknown platforms", () => {
    expect(platformNotifyScript("darwin")?.destRel).toBe(".ithyno/scripts/notify-waiting.sh");
    expect(platformNotifyScript("linux")?.destRel).toBe(".ithyno/scripts/notify-waiting.sh");
    expect(platformNotifyScript("win32")?.destRel).toBe(".ithyno/scripts/notify-waiting.ps1");
    expect(platformNotifyScript("freebsd")).toBeNull();
  });
  it("scaffolds an executable script idempotently", async () => {
    const root = await tempRoot();
    expect((await scaffoldNotifyScript(root, false, { platform: "linux", log: () => {} }))?.action).toBe("create");
    expect((await scaffoldNotifyScript(root, false, { platform: "linux", log: () => {} }))?.action).toBe("skip");
    const scriptStat = await stat(join(root, ".ithyno/scripts/notify-waiting.sh"));
    if (process.platform !== "win32") expect(scriptStat.mode & 0o111).toBeTruthy();
  });
  it("merges Claude hooks while preserving users and avoiding duplicates", async () => {
    const root = await tempRoot();
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, ".claude/settings.json"), '{\n // user setting\n "hooks": { "Notification": [{"matcher":"*","hooks":[{"type":"command","command":"user-hook"}]}] }\n}');
    const warnings = [];
    await installClaudeNotifyHook(root, "/tmp/notify.sh", false, { log: (m) => warnings.push(m) });
    await installClaudeNotifyHook(root, "/tmp/notify.sh", false, { log: () => {} });
    const result = JSON.parse(await readFile(join(root, ".claude/settings.json"), "utf8"));
    expect(result.hooks.Notification).toHaveLength(2);
    expect(result.hooks.Notification[0].hooks[0].command).toBe("user-hook");
    expect(result.hooks.Stop[0].hooks[0].command).toBe("/tmp/notify.sh");
    expect(warnings).toHaveLength(1);
  });
  it("merges, detects, and removes only the Codex project hook", async () => {
    const root = await tempRoot();
    await mkdir(join(root, ".codex"), { recursive: true });
    await writeFile(join(root, ".codex/hooks.json"), JSON.stringify({ hooks: { Stop: [{ matcher: "*", hooks: [{ type: "command", command: "user-hook" }] }] } }));
    await installCodexNotifyHook(root, "/tmp/notify.sh");
    await installCodexNotifyHook(root, "/tmp/notify.sh");
    expect((await codexNotifyHookStatus(root, "/tmp/notify.sh")).enabled).toBe(true);
    const installed = JSON.parse(await readFile(join(root, ".codex/hooks.json"), "utf8"));
    expect(installed.hooks.Stop).toHaveLength(2);
    await removeCodexNotifyHook(root, "/tmp/notify.sh");
    const removed = JSON.parse(await readFile(join(root, ".codex/hooks.json"), "utf8"));
    expect(removed.hooks.Stop).toHaveLength(1);
    expect(removed.hooks.Stop[0].hooks[0].command).toBe("user-hook");
  });
  it("writes Copilot's cross-platform repository hook and preserves user entries", async () => {
    const root = await tempRoot();
    await installCopilotNotifyHook(root, join(root, ".ithyno/scripts/notify-waiting.sh"));
    await installCopilotNotifyHook(root, join(root, ".ithyno/scripts/notify-waiting.sh"));
    expect((await copilotNotifyHookStatus(root, join(root, ".ithyno/scripts/notify-waiting.sh"))).enabled).toBe(true);
    const installed = JSON.parse(await readFile(join(root, ".github/hooks/ithyno-notification.json"), "utf8"));
    expect(installed.version).toBe(1);
    expect(installed.hooks.notification).toHaveLength(1);
    expect(installed.hooks.notification[0].bash).toContain("notify-waiting.sh");
    await removeCopilotNotifyHook(root, join(root, ".ithyno/scripts/notify-waiting.sh"));
    expect((await copilotNotifyHookStatus(root, join(root, ".ithyno/scripts/notify-waiting.sh"))).enabled).toBe(false);
  });
});
