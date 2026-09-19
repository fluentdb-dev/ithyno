// SPDX-License-Identifier: GPL-3.0-or-later
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  EncryptionConfirmationDialog,
  EnvironmentActionButtons,
  EnvironmentDeleteConfirmDialog,
  EnvironmentDiagnostics,
  EnvironmentEmptyState,
  EnvironmentNativeActionButtons,
  EnvironmentNoProfileState,
  EnvironmentProfileControls,
  EnvironmentProfileDeleteDialog,
  EnvironmentValueCell,
  buildPendingOperations,
  describeEncryptionStatus,
  hasRevealedEnvironmentValue,
  readDraftState,
  removeRevealedEnvironmentValue,
  stageEnvironmentRemoval,
  shouldShowEncryptionStatus,
  shouldShowRestartRequired,
  writeDraftState,
  type DraftState,
} from "./Environment";

describe("environment page helpers", () => {
  it("renders an explicit empty state for a project with no env files", () => {
    const markup = renderToStaticMarkup(<EnvironmentEmptyState />);
    expect(markup).toContain("No env files exist yet");
    expect(markup).toContain("ithyno session variables stay separate");
  });

  it("renders a dedicated first-profile prompt when no environment exists yet", () => {
    const markup = renderToStaticMarkup(
      <EnvironmentNoProfileState
        createProfileName=""
        setCreateProfileName={() => undefined}
        onCreateProfile={() => undefined}
        loading={false}
      />,
    );
    expect(markup).toContain("No environment is configured yet");
    expect(markup).toContain("Create first profile");
    expect(markup).toContain("Create the first project profile");
  });

  it("renders masked values until explicitly revealed", () => {
    const variable = { key: "SECRET", maskedValue: "********", source: ".env", sourcePath: ".env", reserved: false };
    const masked = renderToStaticMarkup(<EnvironmentValueCell variable={variable} />);
    expect(masked).toContain("********");

    const revealed = renderToStaticMarkup(<EnvironmentValueCell variable={variable} revealedValue="actual-secret" />);
    expect(revealed).toContain("actual-secret");
    expect(revealed).not.toContain("********");
  });

  it("round-trips unsaved drafts through storage", () => {
    const storage = createStorage();
    const draft: DraftState = { edits: { API_URL: "https://example.test" }, removals: ["OLD_KEY"] };

    writeDraftState(draft, storage);
    expect(readDraftState(storage)).toEqual(draft);
  });

  it("builds a review summary for pending edits and removals", () => {
    const draft: DraftState = { edits: { API_URL: "https://example.test" }, removals: ["OLD_KEY"] };
    expect(buildPendingOperations("dev", draft)).toEqual([
      "write API_URL=https://example.test into dev",
      "remove OLD_KEY from dev",
    ]);
  });

  it("marks a restart as required when the saved revision is stale", () => {
    expect(shouldShowRestartRequired("rev-1", "rev-2", true)).toBe(true);
    expect(shouldShowRestartRequired("rev-2", "rev-2", true)).toBe(false);
    expect(shouldShowRestartRequired(null, "rev-2", true)).toBe(false);
  });

  it("explains whether dotenv encryption is available in the runtime environment", () => {
    expect(describeEncryptionStatus("ready")).toBe("ready");
    expect(describeEncryptionStatus("ready", { encrypted: false })).toContain("plaintext");
    expect(describeEncryptionStatus("ready", { source: "DOTENV_PRIVATE_KEY_DEVELOPMENT" })).toContain("DOTENV_PRIVATE_KEY_DEVELOPMENT");
    expect(describeEncryptionStatus("missing")).toContain("matching dotenvx private key");
    expect(describeEncryptionStatus("missing")).not.toContain("DOTENVX_KEY");
    expect(describeEncryptionStatus("missing")).not.toContain("DOTENV_KEY");
  });

  it("keeps normal encryption state quiet and shows only states requiring attention", () => {
    expect(shouldShowEncryptionStatus("ready")).toBe(false);
    expect(shouldShowEncryptionStatus("missing")).toBe(true);
  });

  it("renders an exact first-encryption confirmation with profile, key file, and gitignore details", () => {
    const markup = renderToStaticMarkup(
      <EncryptionConfirmationDialog
        profile="development"
        profilePath=".env.development"
        keyFilePath=".env.keys"
        gitignoreEntry=".env.keys"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(markup).toContain("Encrypt profile — development");
    expect(markup).toContain(".env.development");
    expect(markup).toContain(".env.keys");
    expect(markup).toContain("append the exact Git ignore entry");
    expect(markup).toContain(".gitignore");
  });

  it("explains OS secure storage move/copy behavior only when supported", () => {
    const supported = renderToStaticMarkup(
      <EnvironmentNativeActionButtons
        native={{ supported: true, platform: "darwin", tool: "/usr/bin/security" }}
        profile="development"
        profilePath=".env.development"
        onAction={vi.fn()}
      />,
    );
    const unsupported = renderToStaticMarkup(
      <EnvironmentNativeActionButtons
        native={{ supported: false, platform: "linux", reason: "missing" }}
        profile="development"
        profilePath=".env.development"
        onAction={vi.fn()}
      />,
    );
    expect(supported).toContain("OS secure key storage");
    expect(supported).toContain("Move key to OS storage");
    expect(supported).toContain("Copy key to OS storage");
    expect(supported).toContain("removes this profile key from");
    expect(supported).toContain("keeps");
    expect(unsupported).not.toContain("OS secure key storage");
  });

  it("places encryption and a labelled trash action beside the active profile", () => {
    const markup = renderToStaticMarkup(
      <EnvironmentProfileControls
        profiles={[{ name: "development", path: ".env.development", exists: true, isBase: false, selected: true }]}
        selectedProfile="development"
        loading={false}
        encrypting={false}
        canEncrypt={true}
        onSelect={vi.fn()}
        onEncrypt={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(markup).toContain("Active profile");
    expect(markup).toContain("Encrypt profile");
    expect(markup).toContain('aria-label="Delete active profile development"');
    expect(markup).not.toContain("Delete profile</button>");
  });

  it("explains exact profile deletion without touching keys", () => {
    const markup = renderToStaticMarkup(
      <EnvironmentProfileDeleteDialog
        profile="development"
        profilePath=".env.development"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(markup).toContain("Delete profile — development");
    expect(markup).toContain(".env.development");
    expect(markup).toContain(".env.keys");
    expect(markup).toContain("does not touch");
  });

  it("shows wrong-key and orphaned-key guidance without secret values", () => {
    const markup = renderToStaticMarkup(
      <EnvironmentDiagnostics diagnostics={[
        { kind: "decryption-failed", severity: "error", message: "The available profile key could not decrypt the selected profile." },
        { kind: "orphaned-key", severity: "warning", message: "Orphaned dotenvx key identifier: DOTENV_PRIVATE_KEY_OLD", path: ".env.keys" },
      ]} />,
    );
    expect(markup).toContain("decryption-failed");
    expect(markup).toContain("orphaned-key");
    expect(markup).toContain("DOTENV_PRIVATE_KEY_OLD");
    expect(markup).not.toContain("private-key-value");
  });
});

describe("revealed environment value helpers", () => {
  it("detects revealed values by key presence, not truthiness", () => {
    const revealed: Record<string, string> = { EMPTY: "", NONEMPTY: "secret" };

    expect(hasRevealedEnvironmentValue(revealed, "EMPTY")).toBe(true);
    expect(hasRevealedEnvironmentValue(revealed, "NONEMPTY")).toBe(true);
    expect(hasRevealedEnvironmentValue(revealed, "MISSING")).toBe(false);
  });

  it("removes revealed values while preserving others", () => {
    const revealed: Record<string, string> = { API_KEY: "secret", DB_PASS: "", OTHER: "value" };

    const result = removeRevealedEnvironmentValue(revealed, "DB_PASS");

    expect(hasRevealedEnvironmentValue(result, "DB_PASS")).toBe(false);
    expect(hasRevealedEnvironmentValue(result, "API_KEY")).toBe(true);
    expect(hasRevealedEnvironmentValue(result, "OTHER")).toBe(true);
    expect(result).toEqual({ API_KEY: "secret", OTHER: "value" });
  });

  it("does not mutate the original revealed state", () => {
    const revealed: Record<string, string> = { KEY: "value" };
    const original = revealed;

    removeRevealedEnvironmentValue(revealed, "KEY");

    expect(revealed).toBe(original);
    expect(hasRevealedEnvironmentValue(revealed, "KEY")).toBe(true);
  });
});

describe("environment action buttons", () => {
  it("treats an empty revealed value as revealed", () => {
    expect(hasRevealedEnvironmentValue({ EMPTY_SECRET: "" }, "EMPTY_SECRET")).toBe(true);
    expect(hasRevealedEnvironmentValue({}, "EMPTY_SECRET")).toBe(false);
  });

  it("hides only the requested value", () => {
    const revealed = { FIRST_SECRET: "one", SECOND_SECRET: "two" };

    expect(removeRevealedEnvironmentValue(revealed, "FIRST_SECRET")).toEqual({
      SECOND_SECRET: "two",
    });
    expect(revealed).toEqual({ FIRST_SECRET: "one", SECOND_SECRET: "two" });
  });

  it("stages a deletion without mutating the existing draft", () => {
    const draft: DraftState = {
      edits: { DELETE_ME: "draft", KEEP_ME: "value" },
      removals: ["ALREADY_REMOVED"],
    };

    expect(stageEnvironmentRemoval(draft, "DELETE_ME")).toEqual({
      edits: { KEEP_ME: "value" },
      removals: ["ALREADY_REMOVED", "DELETE_ME"],
    });
    expect(draft.edits).toHaveProperty("DELETE_ME", "draft");
  });

  it("renders a destructive confirmation before deleting a variable", () => {
    const markup = renderToStaticMarkup(
      <EnvironmentDeleteConfirmDialog
        variableKey="SECRET"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Delete variable — SECRET");
    expect(markup).toContain("after you save the pending changes");
  });

  const createVariable = (key = "SECRET") => ({
    key,
    maskedValue: "********",
    source: ".env",
    sourcePath: ".env",
    reserved: false,
  });

  it("renders reveal button when value is not revealed", () => {
    const markup = renderToStaticMarkup(
      <EnvironmentActionButtons
        variable={createVariable()}
        isRevealed={false}
        onToggleReveal={vi.fn()}
        onCopy={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Reveal value"');
    expect(markup).not.toContain('aria-label="Hide value"');
  });

  it("renders hide button when value is revealed", () => {
    const markup = renderToStaticMarkup(
      <EnvironmentActionButtons
        variable={createVariable()}
        isRevealed={true}
        onToggleReveal={vi.fn()}
        onCopy={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Hide value"');
    expect(markup).not.toContain('aria-label="Reveal value"');
  });

  it("provides copy, edit, delete buttons with accessible labels", () => {
    const markup = renderToStaticMarkup(
      <EnvironmentActionButtons
        variable={createVariable()}
        isRevealed={false}
        onToggleReveal={vi.fn()}
        onCopy={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Copy value"');
    expect(markup).toContain('aria-label="Edit value"');
    expect(markup).toContain('aria-label="Delete value"');
  });

  it("has title attributes for all buttons", () => {
    const markup = renderToStaticMarkup(
      <EnvironmentActionButtons
        variable={createVariable()}
        isRevealed={false}
        onToggleReveal={vi.fn()}
        onCopy={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(markup).toContain('title="Reveal value"');
    expect(markup).toContain('title="Copy value"');
    expect(markup).toContain('title="Edit value"');
    expect(markup).toContain('title="Delete value"');
  });

  it("marks SVG icons as aria-hidden for proper accessibility", () => {
    const markup = renderToStaticMarkup(
      <EnvironmentActionButtons
        variable={createVariable()}
        isRevealed={false}
        onToggleReveal={vi.fn()}
        onCopy={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const svgCount = (markup.match(/aria-hidden="true"/g) || []).length;
    expect(svgCount).toBeGreaterThanOrEqual(4);
  });
});

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.has(key) ? values.get(key) ?? null : null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    get length() {
      return values.size;
    },
  };
}
