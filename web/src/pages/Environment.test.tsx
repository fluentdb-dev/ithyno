// SPDX-License-Identifier: GPL-3.0-or-later
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EnvironmentEmptyState,
  EnvironmentNoProfileState,
  EnvironmentValueCell,
  buildPendingOperations,
  describeEncryptionStatus,
  readDraftState,
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
    expect(describeEncryptionStatus("missing")).toContain("DOTENVX_KEY");
    expect(describeEncryptionStatus("missing")).toContain("DOTENV_KEY");
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
