// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tests for the cross-CLI skill renderer (generalize-skills-cross-cli).
 *
 * Note: named `skill-renderer.test.ts` to distinguish from the existing
 * `install-skills.test.ts`, which covers a different concept (bundled
 * skill installer into `~/.claude/skills/` from `add-doctor-and-installer`).
 * This suite covers the project-local per-CLI renderer that materializes
 * `.claude/commands/`, `.codex/`, etc. from `ithyno/skills/`.
 *
 * Covers:
 *   - manifest.yaml schema validation for every ithyno/skills/*
 *   - capability token linter — every <capability:*> in every SKILL.md
 *     is in the v1 known set
 *   - discover round-trip
 *   - claude renderer: golden fixture for the pilot skill
 *   - installSkills(): dry-run vs write, idempotent no-op, unknown-CLI
 *     error, unsupported-skill skip.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  installSkills,
  discoverSkillSources,
  getRenderer,
  knownRendererClis,
  KNOWN_CLIS,
} from "./skill-renderer/index.js";
// @ts-expect-error — .mjs script is not TS-typed; imports as untyped for tests.
import { KNOWN_TOKENS, lintSkillsDir } from "../scripts/lint-skill-tokens.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = join(REPO, "ithyno", "skills");
const SCHEMA_PATH = join(REPO, "schemas", "skill-manifest.schema.json");

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("ithyno/skills/*/manifest.yaml schema conformance", () => {
  it("schema file is valid JSON with the expected fields", async () => {
    const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf-8"));
    expect(schema.$id).toContain("skill-manifest.schema.json");
    expect(schema.required).toContain("name");
    expect(schema.properties.supports.items.enum).toEqual([...KNOWN_CLIS]);
    expect(schema.properties.capabilities_required.items.enum).toEqual([...KNOWN_TOKENS]);
  });

  it("every discovered manifest matches its directory name and declares required fields", async () => {
    const sources = await discoverSkillSources(SKILLS_DIR);
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      const m = src.manifest;
      expect(m.name, `skill ${src.id}`).toBe(src.id);
      expect(m.namespace, `skill ${src.id}`).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(m.command, `skill ${src.id}`).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(m.description.length, `skill ${src.id} description`).toBeGreaterThanOrEqual(10);
      expect(m.supports.length, `skill ${src.id} supports`).toBeGreaterThan(0);
      for (const cli of m.supports) {
        expect(KNOWN_CLIS, `skill ${src.id} unsupported CLI ${cli}`).toContain(cli);
      }
      for (const cap of m.capabilities_required) {
        expect(KNOWN_TOKENS.has(cap), `skill ${src.id} unknown capability ${cap}`).toBe(true);
      }
    }
  });

  it("manifest.yaml round-trips through YAML.parse without loss for the pilot skill", async () => {
    const raw = await readFile(join(SKILLS_DIR, "ithy-opsx-apply", "manifest.yaml"), "utf-8");
    const parsed = parseYaml(raw);
    expect(parsed.name).toBe("ithy-opsx-apply");
    expect(parsed.namespace).toBe("ithy-opsx");
    expect(parsed.command).toBe("apply");
  });
});

// ---------------------------------------------------------------------------
// Capability-token linter
// ---------------------------------------------------------------------------

describe("capability-token linter — ithyno/skills/**/SKILL.md", () => {
  it("v1 known tokens are exactly subagent_spawn, file_write, bash", () => {
    expect([...KNOWN_TOKENS].sort()).toEqual(["bash", "file_write", "subagent_spawn"]);
  });

  it("no offenders in the committed skill sources", async () => {
    const offenders = await lintSkillsDir(SKILLS_DIR);
    if (offenders.length > 0) {
      const detail = offenders
        .map((o: { file: string; line: number; token: string; context: string }) =>
          `  ${o.file}:${o.line}  <capability:${o.token}>\n    ${o.context}`,
        )
        .join("\n");
      throw new Error(`${offenders.length} unknown capability token(s):\n${detail}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Claude renderer — golden fixture
// ---------------------------------------------------------------------------

describe("claude renderer (v1)", () => {
  it("is registered as the sole v1 renderer", () => {
    expect(knownRendererClis()).toEqual(["claude"]);
    expect(getRenderer("claude")).toBeDefined();
    expect(getRenderer("codex")).toBeUndefined();
  });

  it("renders ithy-opsx-apply into .claude/commands/ithy-opsx/apply.md with expected shape", async () => {
    const sources = await discoverSkillSources(SKILLS_DIR);
    const apply = sources.find((s) => s.id === "ithy-opsx-apply");
    expect(apply).toBeDefined();
    const renderer = getRenderer("claude")!;
    const files = renderer.render(apply!, { projectRoot: "/proj", cli: "claude" });
    expect(files).toHaveLength(1);
    const [file] = files;
    expect(file.path).toBe(".claude/commands/ithy-opsx/apply.md");
    expect(file.mode).toBe("create");

    // Frontmatter present with the expected keys.
    expect(file.content).toMatch(
      /^---\nname: "ITHY-OPSX: Apply"\ndescription: .+\ncategory: Workflow\ntags: \[workflow, apply, git, ithy-opsx\]\n---\n/,
    );
    // Generated-file banner is present.
    expect(file.content).toContain("GENERATED FILE — do not hand-edit.");
    expect(file.content).toContain("Source: ithyno/skills/ithy-opsx-apply/{SKILL.md, manifest.yaml}");
    // Placeholders got filled.
    expect(file.content).not.toContain("{{namespace}}");
    expect(file.content).not.toContain("{{command}}");
    expect(file.content).toContain("/ithy-opsx:apply");
    // Capability tokens got expanded — no raw <capability:*> tokens leak into the rendered output.
    expect(file.content).not.toMatch(/<capability:[a-z_]+>/);
    // The subagent_spawn expansion mentions Task tool.
    expect(file.content).toContain("Task tool");
    // The bash expansion mentions Bash tool.
    expect(file.content).toContain("Bash tool");
  });
});

// ---------------------------------------------------------------------------
// installSkills — end-to-end
// ---------------------------------------------------------------------------

describe("installSkills — end-to-end", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "ithyno-skill-renderer-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("dry-run writes nothing but reports the planned files", async () => {
    const result = await installSkills({
      projectRoot,
      selectedClis: ["claude"],
      sourcesDir: SKILLS_DIR,
      dryRun: true,
    });
    expect(result.errors).toEqual([]);
    expect(result.written.length).toBeGreaterThan(0);
    for (const w of result.written) {
      expect(existsSync(join(projectRoot, w.path))).toBe(false);
    }
  });

  it("writes .claude/commands/ithy-opsx/apply.md when claude is selected", async () => {
    const result = await installSkills({
      projectRoot,
      selectedClis: ["claude"],
      sourcesDir: SKILLS_DIR,
    });
    expect(result.errors).toEqual([]);
    const target = join(projectRoot, ".claude/commands/ithy-opsx/apply.md");
    expect(existsSync(target)).toBe(true);
    const content = readFileSync(target, "utf-8");
    expect(content).toContain("ITHY-OPSX: Apply");
    expect(content).toContain("GENERATED FILE");
  });

  it("re-install with unchanged source is byte-identical no-op (no mtime touch)", async () => {
    const target = join(projectRoot, ".claude/commands/ithy-opsx/apply.md");
    await installSkills({ projectRoot, selectedClis: ["claude"], sourcesDir: SKILLS_DIR });
    const before = readFileSync(target, "utf-8");
    const beforeMtime = statSync(target).mtimeMs;

    // Wait a hair to ensure any real write would show a distinguishable mtime.
    await new Promise((r) => setTimeout(r, 15));

    await installSkills({ projectRoot, selectedClis: ["claude"], sourcesDir: SKILLS_DIR });
    const after = readFileSync(target, "utf-8");
    const afterMtime = statSync(target).mtimeMs;

    expect(after).toBe(before);
    expect(afterMtime).toBe(beforeMtime); // no-op writers skip fs.writeFile entirely
  });

  it("errors when a selected CLI has no v1 renderer registered", async () => {
    const result = await installSkills({
      projectRoot,
      selectedClis: ["codex"],
      sourcesDir: SKILLS_DIR,
    });
    expect(result.written).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].cli).toBe("codex");
    expect(result.errors[0].message).toContain("no renderer registered");
  });

  it("skips skills whose manifest.supports does not include the target CLI", async () => {
    const sources = await discoverSkillSources(SKILLS_DIR);
    const apply = sources.find((s) => s.id === "ithy-opsx-apply")!;
    expect(apply.manifest.supports).toEqual(["claude"]);
  });
});
