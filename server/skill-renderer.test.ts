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
 * Rework round 2 (fable review) adds:
 *   - real skip-branch coverage via synthetic sourcesDir (#2)
 *   - per-entry discovery error routing to installSkills().errors (#3)
 *   - renderer × known-token leak matrix (#4)
 *   - YAML escape defense for frontmatter emission (#1)
 *   - UTF-8 byte count in InstallResult.bytes (#7)
 *   - manifest-value $-pattern defense in placeholder fill (#8)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  installSkills,
  discoverSkillSources,
  discoverSkillSourcesDetailed,
  getRenderer,
  knownRendererClis,
  KNOWN_CLIS,
  type SkillSource,
} from "./skill-renderer/index.js";
// @ts-expect-error — .mjs script is not TS-typed; imports as untyped for tests.
import { KNOWN_TOKENS, lintSkillsDir } from "../scripts/lint-skill-tokens.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = join(REPO, "ithyno", "skills");
const SCHEMA_PATH = join(REPO, "schemas", "skill-manifest.schema.json");

// Helper: build an in-tmpdir sources dir containing one hand-crafted skill.
// Used to exercise skip / error paths without touching the real skills.
function mkSynthSkill(
  skillsDir: string,
  id: string,
  manifest: Record<string, unknown>,
  body: string,
): void {
  const dir = join(skillsDir, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.yaml"), (require("yaml") as typeof import("yaml")).stringify(manifest));
  writeFileSync(join(dir, "SKILL.md"), body);
}

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
// Claude renderer — golden fixture + escape defenses
// ---------------------------------------------------------------------------

describe("claude renderer (v1)", () => {
  it("is registered alongside the other 6 renderers (scaffold-ithy-opsx-skills-per-cli)", () => {
    // Post scaffold-ithy-opsx-skills-per-cli: all 7 CLIs are
    // registered (claude + codex + antigravity + cursor + gemini +
    // copilot + opencode). Sorted for stable comparison.
    expect([...knownRendererClis()].sort()).toEqual(
      ["antigravity", "claude", "codex", "copilot", "cursor", "gemini", "opencode"].sort(),
    );
    expect(getRenderer("claude")).toBeDefined();
    expect(getRenderer("codex")).toBeDefined();
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

    // Frontmatter is emitted via yaml.stringify — round-trips cleanly.
    const fm = /^---\n([\s\S]+?)\n---/.exec(file.content);
    expect(fm).not.toBeNull();
    const parsed = parseYaml(fm![1]);
    expect(parsed.name).toBe("ITHY-OPSX: Apply");
    expect(parsed.category).toBe("Workflow");
    expect(parsed.tags).toEqual(["workflow", "apply", "git", "ithy-opsx"]);
    expect(String(parsed.description)).toMatch(/Implement an OpenSpec change/);

    // Generated-file banner is present.
    expect(file.content).toContain("GENERATED FILE — do not hand-edit.");
    expect(file.content).toContain("Source: ithyno/skills/ithy-opsx-apply/{SKILL.md, manifest.yaml}");
    // Placeholders got filled.
    expect(file.content).not.toContain("{{namespace}}");
    expect(file.content).not.toContain("{{command}}");
    expect(file.content).toContain("/ithy-opsx:apply");
    // Capability tokens got expanded — no raw <capability:*> tokens leak.
    expect(file.content).not.toMatch(/<capability:[a-z_]+>/);
    expect(file.content).toContain("Task tool");
    expect(file.content).toContain("Bash tool");
  });

  // #1: YAML escape defense — description with colon-space, sharp,
  //     brackets, or a leading '>' must produce parseable frontmatter.
  it("frontmatter emission escapes YAML-hostile scalars", () => {
    const renderer = getRenderer("claude")!;
    const src: SkillSource = {
      id: "synth",
      sourceDir: "/nowhere",
      manifest: {
        name: "synth",
        namespace: "ns",
        command: "cmd",
        description: "Note: does #things with [brackets] and > angles & ampersands.",
        supports: ["claude"],
        capabilities_required: ["bash"],
        per_cli: { claude: { category: "Cat: With Colon", tags: ["tag: colon"] } },
      },
      body: "body",
    };
    const [file] = renderer.render(src, { projectRoot: "/proj", cli: "claude" });
    const fm = /^---\n([\s\S]+?)\n---/.exec(file.content);
    expect(fm).not.toBeNull();
    // The bug this test guards against: hand-rolled `key: ${value}` breaks
    // on `: `, `#`, `[`, `>`, `&`. `yaml.stringify` handles all of it.
    const parsed = parseYaml(fm![1]);
    expect(parsed.description).toBe(
      "Note: does #things with [brackets] and > angles & ampersands.",
    );
    expect(parsed.category).toBe("Cat: With Colon");
    expect(parsed.tags).toEqual(["tag: colon"]);
  });

  // #8: manifest values with $-patterns must not re-splice via String.replace.
  it("placeholder fill defends against manifest values with $-patterns", () => {
    const renderer = getRenderer("claude")!;
    const src: SkillSource = {
      id: "synth-dollar",
      // Note: the JSON schema would reject these namespace/command values;
      // we bypass discover to prove the runtime defense works even when
      // schema is unenforced.
      manifest: {
        name: "synth-dollar",
        namespace: "ns$&x",
        command: "cmd$'y",
        description: "d",
        supports: ["claude"],
        capabilities_required: [],
      },
      sourceDir: "/nowhere",
      body: "before {{namespace}} middle {{command}} after",
    };
    const [file] = renderer.render(src, { projectRoot: "/proj", cli: "claude" });
    // If String.replace used the string form, "$&" would re-insert the
    // matched placeholder text. Function form makes the value literal.
    expect(file.content).toContain("before ns$&x middle cmd$'y after");
    expect(file.content).not.toContain("{{namespace}}");
    expect(file.content).not.toContain("{{command}}");
  });

  // #4: matrix — for every known capability token, a synthetic body
  //     using that token must NOT leak a raw <capability:*> into any
  //     registered renderer's output.
  it("no known capability token leaks raw into any renderer's output", () => {
    for (const cli of knownRendererClis()) {
      const renderer = getRenderer(cli)!;
      for (const token of KNOWN_TOKENS) {
        const src: SkillSource = {
          id: `synth-${token}`,
          sourceDir: "/nowhere",
          manifest: {
            name: `synth-${token}`,
            namespace: "ns",
            command: "cmd",
            description: "desc",
            supports: [cli],
            capabilities_required: [token as "bash"],
          },
          body: `line before <capability:${token}> line after`,
        };
        const [file] = renderer.render(src, { projectRoot: "/proj", cli });
        expect(
          file.content.match(/<capability:[a-z0-9_]*>/g),
          `renderer ${cli} × token ${token}: raw <capability:*> leaked`,
        ).toBeNull();
      }
    }
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

  // #7: bytes must count UTF-8 bytes, not UTF-16 code units.
  //     Verified with the em-dash-bearing GENERATED banner.
  it("reports bytes as UTF-8 byte count, not string length", async () => {
    const result = await installSkills({
      projectRoot,
      selectedClis: ["claude"],
      sourcesDir: SKILLS_DIR,
    });
    expect(result.errors).toEqual([]);
    for (const w of result.written) {
      const abs = join(projectRoot, w.path);
      const actualBytes = statSync(abs).size;
      expect(w.bytes, `bytes count for ${w.path}`).toBe(actualBytes);
      // Sanity: string length differs from UTF-8 bytes when the content
      // has multi-byte characters (the em dash in the GENERATED banner).
      const strLen = readFileSync(abs, "utf-8").length;
      expect(w.bytes).toBeGreaterThan(strLen);
    }
  });

  it("re-install with unchanged source is byte-identical no-op (no mtime touch)", async () => {
    const target = join(projectRoot, ".claude/commands/ithy-opsx/apply.md");
    await installSkills({ projectRoot, selectedClis: ["claude"], sourcesDir: SKILLS_DIR });
    const before = readFileSync(target, "utf-8");
    const beforeMtime = statSync(target).mtimeMs;

    await new Promise((r) => setTimeout(r, 15));

    await installSkills({ projectRoot, selectedClis: ["claude"], sourcesDir: SKILLS_DIR });
    const after = readFileSync(target, "utf-8");
    const afterMtime = statSync(target).mtimeMs;

    expect(after).toBe(before);
    expect(afterMtime).toBe(beforeMtime);
  });

  it("errors when a selected CLI has no renderer registered (message names available renderers)", async () => {
    // Post scaffold-ithy-opsx-skills-per-cli: all 7 CliId values
    // have renderers, so we can no longer test with a real Cli that
    // has no registration. Cast a bogus string to CliId to hit the
    // fail-loud path. The error message still enumerates the
    // registered renderers via knownRendererClis().
    const result = await installSkills({
      projectRoot,
      selectedClis: ["bogus-cli" as unknown as import("./skill-renderer/types.js").CliId],
      sourcesDir: SKILLS_DIR,
    });
    expect(result.written).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].cli).toBe("bogus-cli" as unknown as import("./skill-renderer/types.js").CliId);
    expect(result.errors[0].message).toContain("no renderer registered");
    // #6: message enumerates from knownRendererClis(), not a hardcoded literal.
    expect(result.errors[0].message).toContain("available: ");
    // Sanity: message names at least the claude renderer (all 7 are
    // present, listing them all is brittle — one is enough).
    expect(result.errors[0].message).toContain("claude");
  });

  // #2: real skip-branch coverage. Build a synthetic sources dir with a
  //     skill whose supports:[codex] and install for claude — the skip
  //     path in installSkills is exercised for real.
  it("skips skills whose manifest.supports does not include the target CLI", async () => {
    const synthRoot = mkdtempSync(join(tmpdir(), "ithyno-synth-sources-"));
    try {
      mkSynthSkill(
        synthRoot,
        "codex-only",
        {
          name: "codex-only",
          namespace: "test",
          command: "codex-only",
          description: "A synthetic skill only supporting codex.",
          supports: ["codex"],
          capabilities_required: ["bash"],
        },
        "body",
      );
      const result = await installSkills({
        projectRoot,
        selectedClis: ["claude"],
        sourcesDir: synthRoot,
      });
      expect(result.errors).toEqual([]);
      expect(result.written).toEqual([]);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toEqual({
        cli: "claude",
        skill: "codex-only",
        reason: 'manifest.supports does not include "claude"',
      });
    } finally {
      rmSync(synthRoot, { recursive: true, force: true });
    }
  });

  // #3: broken skill directories route to result.errors per-entry.
  //     A malformed manifest MUST NOT block installing healthy skills.
  it("routes discovery failures to result.errors and continues installing healthy skills", async () => {
    const synthRoot = mkdtempSync(join(tmpdir(), "ithyno-synth-sources-"));
    try {
      // Healthy skill.
      mkSynthSkill(
        synthRoot,
        "healthy",
        {
          name: "healthy",
          namespace: "test",
          command: "healthy",
          description: "A healthy skill for the mixed-fixture test.",
          supports: ["claude"],
          capabilities_required: ["bash"],
        },
        "healthy body",
      );
      // Malformed YAML in manifest.
      const brokenDir = join(synthRoot, "broken-yaml");
      mkdirSync(brokenDir, { recursive: true });
      writeFileSync(join(brokenDir, "manifest.yaml"), "name: broken-yaml\n  bad-indent: [unclosed");
      writeFileSync(join(brokenDir, "SKILL.md"), "body");
      // Name mismatch.
      mkSynthSkill(
        synthRoot,
        "wrong-name",
        {
          name: "different-name",
          namespace: "test",
          command: "wrong-name",
          description: "Manifest name does not match directory name.",
          supports: ["claude"],
          capabilities_required: [],
        },
        "body",
      );

      const detailed = await discoverSkillSourcesDetailed(synthRoot);
      expect(detailed.sources.map((s) => s.id)).toEqual(["healthy"]);
      expect(detailed.errors).toHaveLength(2);
      const byId = Object.fromEntries(detailed.errors.map((e) => [e.skill, e.message]));
      expect(byId["broken-yaml"]).toContain("parse failed");
      expect(byId["wrong-name"]).toContain("does not match directory name");

      // installSkills routes those into result.errors and still installs healthy.
      const result = await installSkills({
        projectRoot,
        selectedClis: ["claude"],
        sourcesDir: synthRoot,
      });
      expect(result.written.map((w) => w.path)).toEqual([
        ".claude/commands/test/healthy.md",
      ]);
      const discoverErrorSkills = result.errors
        .filter((e) => e.message.startsWith("discover:"))
        .map((e) => e.skill)
        .sort();
      expect(discoverErrorSkills).toEqual(["broken-yaml", "wrong-name"]);
    } finally {
      rmSync(synthRoot, { recursive: true, force: true });
    }
  });

  // #5 (partial — deferred to wire-into-init for a full discriminant):
  //   dry-run + diff surfaces "would update" into `written` (with a
  //   `diff` note), NOT into `errors`. Callers gating on
  //   `errors.length === 0` stay clean.
  it("dry-run diff surfaces pending updates in `written`, not `errors`", async () => {
    // First install to populate.
    await installSkills({ projectRoot, selectedClis: ["claude"], sourcesDir: SKILLS_DIR });
    // Mutate the on-disk file so the next dry-run sees a diff.
    const target = join(projectRoot, ".claude/commands/ithy-opsx/apply.md");
    writeFileSync(target, "hand-edited\n", "utf-8");
    const result = await installSkills({
      projectRoot,
      selectedClis: ["claude"],
      sourcesDir: SKILLS_DIR,
      dryRun: true,
      diff: true,
    });
    expect(result.errors).toEqual([]);
    const withDiff = result.written.filter((w) => w.diff);
    expect(withDiff.length).toBeGreaterThan(0);
    expect(withDiff[0].diff).toMatch(/would update: \d+ → \d+ bytes/);
  });
});

// scaffold-ithy-opsx-skills-per-cli — smoke coverage for the 6 new
// non-Claude renderers. Each renderer should:
//  - be registered under its CliId key
//  - render the pilot skill (ithy-opsx-apply, now `supports:` all 7 CLIs)
//    to at least one file at a CLI-declared path
//  - land the file with valid frontmatter + the generated-file banner
//
// Path assertions are intentionally shape-based (namespace / command
// tokens present in the emitted path, not exact-string) so per-CLI
// path tweaks during MVP polish do not tank the whole test grid.
describe("non-Claude renderers (scaffold-ithy-opsx-skills-per-cli)", () => {
  const NON_CLAUDE: ReadonlyArray<{
    cli: import("./skill-renderer/types.js").CliId;
    pathContains: string[];
  }> = [
    { cli: "codex", pathContains: [".codex/", "ithy-opsx", "apply"] },
    { cli: "antigravity", pathContains: [".antigravity/", "ithy-opsx", "apply"] },
    { cli: "cursor", pathContains: [".cursor/rules/", "ithy-opsx", "apply", ".mdc"] },
    { cli: "gemini", pathContains: [".gemini/", "ithy-opsx", "apply"] },
    { cli: "copilot", pathContains: [".github/", "ithy-opsx", "apply"] },
    { cli: "opencode", pathContains: [".opencode/", "ithy-opsx", "apply"] },
  ];

  for (const spec of NON_CLAUDE) {
    it(`registers ${spec.cli} renderer`, () => {
      expect(getRenderer(spec.cli)).toBeDefined();
    });

    it(`renders ithy-opsx-apply for ${spec.cli} at a CLI-declared path`, async () => {
      const sources = await discoverSkillSources(SKILLS_DIR);
      const apply = sources.find((s) => s.id === "ithy-opsx-apply")!;
      const renderer = getRenderer(spec.cli)!;
      const files = renderer.render(apply, { projectRoot: "/proj", cli: spec.cli });
      expect(files.length).toBeGreaterThan(0);
      for (const fragment of spec.pathContains) {
        expect(files[0].path).toContain(fragment);
      }
      // Frontmatter fence present.
      expect(files[0].content.startsWith("---")).toBe(true);
      // Generated banner present.
      expect(files[0].content).toContain("GENERATED FILE");
      expect(files[0].content).toContain("ithyno/skills/ithy-opsx-apply");
    });
  }

  it("mapDoctorCliToRendererCli maps agy → antigravity", async () => {
    const mod = await import("./skill-renderer/renderers/index.js");
    expect(mod.mapDoctorCliToRendererCli("agy")).toBe("antigravity");
    expect(mod.mapDoctorCliToRendererCli("antigravity")).toBe("antigravity");
    expect(mod.mapDoctorCliToRendererCli("claude")).toBe("claude");
    expect(mod.mapDoctorCliToRendererCli("bogus")).toBeUndefined();
  });
});

// scaffold-ithy-opsx-skills-per-cli task 5 — end-to-end init smoke
// coverage per non-Claude CLI. Each test picks one CLI, runs
// installSkills against a fresh tmpdir, and asserts the CLI-declared
// path landed. Shape-based assertions match the renderer-unit tests
// above so per-CLI path polish stays decoupled from correctness.
describe("installSkills — per-CLI end-to-end (scaffold-ithy-opsx-skills-per-cli)", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "ithyno-percli-e2e-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  const CASES: ReadonlyArray<{
    cli: import("./skill-renderer/types.js").CliId;
    expectedPathContains: string[];
  }> = [
    { cli: "codex", expectedPathContains: [".codex/", "ithy-opsx", "apply"] },
    { cli: "antigravity", expectedPathContains: [".antigravity/", "ithy-opsx"] },
    { cli: "cursor", expectedPathContains: [".cursor/rules/", ".mdc"] },
    { cli: "gemini", expectedPathContains: [".gemini/", "ithy-opsx"] },
    { cli: "copilot", expectedPathContains: [".github/", "ithy-opsx"] },
    { cli: "opencode", expectedPathContains: [".opencode/", "ithy-opsx"] },
  ];

  for (const { cli, expectedPathContains } of CASES) {
    it(`materializes the pilot skill on disk for ${cli}`, async () => {
      const result = await installSkills({
        projectRoot,
        selectedClis: [cli],
        sourcesDir: SKILLS_DIR,
      });
      expect(result.errors).toEqual([]);
      expect(result.written.length).toBeGreaterThan(0);
      const emitted = result.written[0].path;
      for (const fragment of expectedPathContains) {
        expect(emitted).toContain(fragment);
      }
      expect(existsSync(join(projectRoot, emitted))).toBe(true);
      const content = readFileSync(join(projectRoot, emitted), "utf-8");
      expect(content).toContain("GENERATED FILE");
      expect(content).toContain("ithyno/skills/ithy-opsx-apply");
    });
  }

  it("selecting multiple CLIs in one call materializes all of them", async () => {
    const result = await installSkills({
      projectRoot,
      selectedClis: ["claude", "antigravity", "cursor"],
      sourcesDir: SKILLS_DIR,
    });
    expect(result.errors).toEqual([]);
    expect(result.written.length).toBeGreaterThanOrEqual(3);
    expect(existsSync(join(projectRoot, ".claude/commands/ithy-opsx/apply.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".antigravity/skills/ithy-opsx-apply/SKILL.md"))).toBe(true);
    // Cursor: exact filename is namespace-command.mdc
    expect(existsSync(join(projectRoot, ".cursor/rules/ithy-opsx-apply.mdc"))).toBe(true);
  });
});
