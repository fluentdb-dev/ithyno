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
  it("keeps the portable test probe body derived from the Claude-authoritative skill", () => {
    const claude = readFileSync(
      join(REPO, ".claude", "skills", "ithy-opsx-test-probe", "SKILL.md"),
      "utf8",
    ).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    const portable = readFileSync(
      join(SKILLS_DIR, "ithy-opsx-test-probe", "SKILL.md"),
      "utf8",
    );
    expect(portable.trim()).toBe(claude.trim());
  });

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
  // Aligned with openspec's own per-CLI adapters
  // (`node_modules/@fission-ai/openspec/dist/core/command-generation/
  // adapters/*.js`) — each CLI reads only from its adapter's declared
  // path. Deviations produce dead-code output that the CLI never
  // discovers.
  const NON_CLAUDE: ReadonlyArray<{
    cli: import("./skill-renderer/types.js").CliId;
    pathContains: string[];
  }> = [
    { cli: "codex", pathContains: [".codex/", "ithy-opsx-apply", ".md"] },
    // agy: nested `<ns>/<cmd>.md` so slash-command surface is `/ithy-opsx:apply`.
    { cli: "antigravity", pathContains: [".agent/workflows/ithy-opsx-apply.md"] },
    { cli: "cursor", pathContains: [".cursor/commands/", "ithy-opsx-apply", ".md"] },
    { cli: "gemini", pathContains: [".gemini/commands/", "ithy-opsx/apply", ".toml"] },
    { cli: "copilot", pathContains: [".github/prompts/", "ithy-opsx-apply", ".prompt.md"] },
    { cli: "opencode", pathContains: [".opencode/commands/", "ithy-opsx-apply", ".md"] },
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
      // Gemini emits TOML (no `---` fence); everything else uses YAML frontmatter.
      if (spec.cli === "gemini") {
        expect(files[0].content).toContain("description =");
        expect(files[0].content).toContain("prompt =");
      } else {
        expect(files[0].content.startsWith("---")).toBe(true);
      }
      // Generated banner present (HTML comment for markdown, `#` line for TOML).
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
    probeCommandPath: string;
  }> = [
    {
      cli: "claude",
      expectedPathContains: [".claude/commands/ithy-opsx/"],
      probeCommandPath: ".claude/commands/ithy-opsx/test-probe.md",
    },
    {
      cli: "codex",
      expectedPathContains: [".codex/", "ithy-opsx-"],
      probeCommandPath: ".codex/prompts/ithy-opsx-test-probe.md",
    },
    {
      cli: "antigravity",
      expectedPathContains: [".agent/workflows/ithy-opsx-"],
      probeCommandPath: ".agent/workflows/ithy-opsx-test-probe.md",
    },
    {
      cli: "cursor",
      expectedPathContains: [".cursor/commands/", ".md"],
      probeCommandPath: ".cursor/commands/ithy-opsx-test-probe.md",
    },
    {
      cli: "gemini",
      expectedPathContains: [".gemini/commands/", ".toml"],
      probeCommandPath: ".gemini/commands/ithy-opsx/test-probe.toml",
    },
    {
      cli: "copilot",
      expectedPathContains: [".github/prompts/", ".prompt.md"],
      probeCommandPath: ".github/prompts/ithy-opsx-test-probe.prompt.md",
    },
    {
      cli: "opencode",
      expectedPathContains: [".opencode/commands/", "ithy-opsx"],
      probeCommandPath: ".opencode/commands/ithy-opsx-test-probe.md",
    },
  ];

  for (const { cli, expectedPathContains, probeCommandPath } of CASES) {
    it(`materializes every ported ithy-opsx skill on disk for ${cli}`, async () => {
      const result = await installSkills({
        projectRoot,
        selectedClis: [cli],
        sourcesDir: SKILLS_DIR,
      });
      expect(result.errors).toEqual([]);
      // At minimum: apply + dispatch (port-ithy-opsx-dispatch-to-universal-source baseline).
      expect(result.written.length).toBeGreaterThanOrEqual(2);

      const paths = result.written.map((w) => w.path);
      const applyPath = paths.find((p) => p.includes("apply"));
      const dispatchPath = paths.find((p) => p.includes("dispatch"));
      expect(applyPath, `apply skill missing from ${cli} output`).toBeDefined();
      expect(dispatchPath, `dispatch skill missing from ${cli} output`).toBeDefined();

      // Both files carry the expected shape.
      for (const emitted of [applyPath!, dispatchPath!]) {
        for (const fragment of expectedPathContains) {
          expect(emitted).toContain(fragment);
        }
        expect(existsSync(join(projectRoot, emitted))).toBe(true);
        const content = readFileSync(join(projectRoot, emitted), "utf-8");
        expect(content).toContain("GENERATED FILE");
      }

      // Content sources back to the correct universal source per skill.
      expect(readFileSync(join(projectRoot, applyPath!), "utf-8")).toContain(
        "ithyno/skills/ithy-opsx-apply",
      );
      expect(readFileSync(join(projectRoot, dispatchPath!), "utf-8")).toContain(
        "ithyno/skills/ithy-opsx-dispatch",
      );

      // The test probe is a universal source for every supported CLI. This
      // verifies that ithyno/skills does not silently privilege Claude/Codex;
      // each renderer must materialize its own native command/prompt path.
      expect(paths).toContain(probeCommandPath);
      expect(existsSync(join(projectRoot, probeCommandPath))).toBe(true);
      expect(readFileSync(join(projectRoot, probeCommandPath), "utf-8")).toContain(
        "ithyno/skills/ithy-opsx-test-probe",
      );
    });
  }

  it("renders the dispatch routing contract consistently for Claude, Codex, Agy, and fallback clients", async () => {
    const sources = await discoverSkillSources(SKILLS_DIR);
    const dispatch = sources.find((source) => source.id === "ithy-opsx-dispatch");
    expect(dispatch).toBeDefined();

    const render = (cli: import("./skill-renderer/types.js").CliId) => {
      const renderer = getRenderer(cli);
      expect(renderer, `renderer missing for ${cli}`).toBeDefined();
      const files = renderer!.render(dispatch!, { projectRoot: projectRoot, cli });
      const workflow = files.find((file) => file.path.includes("dispatch"));
      expect(workflow, `${cli}: dispatch workflow missing`).toBeDefined();
      return workflow!.content;
    };

    const outputs = {
      claude: render("claude"),
      codex: render("codex"),
      agy: render("antigravity"),
      fallback: render("cursor"),
    };

    for (const [cli, content] of Object.entries(outputs)) {
      expect(content, `${cli}: routing priority missing`).toContain(
        "MANAGER_CLI == WORKER_CLI AND native adapter available for MANAGER_CLI",
      );
      expect(content, `${cli}: AgentRunner fallback missing`).toContain("server AgentRunner");
      expect(content, `${cli}: synchronous wait contract missing`).toContain("wait: true");
      expect(content, `${cli}: transport timeout missing`).toContain("--connect-timeout 10");
      expect(content, `${cli}: authoritative endpoint guard missing`).toContain(
        'if [ -z "${ITHYNO_BASE:-}" ]',
      );
      expect(content, `${cli}: injected port derivation missing`).toContain(
        'ITHYNO_BASE="http://localhost:$ITHYNO_PORT"',
      );
      expect(content, `${cli}: stale endpoint fallback remains`).not.toContain(
        "ITHYNO_PORT:-4321",
      );
      expect(content, `${cli}: token secrecy rule missing`).toContain(
        "Never print the token itself",
      );
      expect(content, `${cli}: per-request freshness checkpoint missing`).toContain(
        "Mandatory freshness checkpoint",
      );
      expect(content, `${cli}: session failure may enter worker fallback`).toContain(
        "failure is not a worker failure",
      );
      expect(content, `${cli}: wrong auth header remains`).not.toContain(
        "Authorization: Bearer $ITHYNO_SESSION_TOKEN",
      );
      expect(content, `${cli}: session-token header missing`).toContain(
        "X-Session-Token: $ITHYNO_SESSION_TOKEN",
      );
      expect(content, `${cli}: transport failure not separated`).toContain(
        'if [ "$CURL_EXIT" -ne 0 ]',
      );
      expect(content, `${cli}: auth failure not separated`).toContain(
        'JOB_STATUS" = "auth required"',
      );
      expect(content, `${cli}: direct argv assembly returned`).not.toContain(
        "<entry.command> <entry.args...> -p <resolved-prompt>",
      );
    }

    expect(outputs.claude).toContain("Claude Manager");
    expect(outputs.claude).toContain("Task tool (or Agent tool)");
    expect(outputs.codex).toContain("Codex Manager");
    expect(outputs.codex).toContain("Fall through to the subprocess branch");
    expect(outputs.codex).toContain("ithy-opsx-escalate");
    expect(outputs.codex).not.toContain("/ithy-opsx:escalate");
    expect(outputs.agy).toContain("Agy / Antigravity Manager");
    expect(outputs.agy).toContain("invoke_subagent");
    expect(outputs.agy).toContain("execution root contract");
    expect(outputs.agy).toContain("/opsx-apply");
    expect(outputs.agy).toContain("/ithy-opsx-review");
    expect(outputs.agy).not.toMatch(/\/(?:ithy-)?opsx:/);
    expect(outputs.agy).not.toContain("Agy 1.1.10 has no child-agent API");
    expect(outputs.agy.indexOf("**agmsg branch**")).toBeLessThan(
      outputs.agy.indexOf("**Native-delegation branch**"),
    );
    expect(outputs.fallback).toContain("CLI not in the native-adapter registry");
  });

  it("renders an Agy dispatch rule that mandates invoke_subagent without changing other CLIs", async () => {
    const sources = await discoverSkillSources(SKILLS_DIR);
    const dispatch = sources.find((source) => source.id === "ithy-opsx-dispatch");
    expect(dispatch).toBeDefined();

    const agyFiles = getRenderer("antigravity")!.render(dispatch!, {
      projectRoot,
      cli: "antigravity",
    });
    const rule = agyFiles.find(
      (file) => file.path === ".agent/rules/ithy-opsx-dispatch.md",
    );
    expect(rule).toBeDefined();
    expect(rule!.content).toContain("MUST call");
    expect(rule!.content).toContain("invoke_subagent");
    expect(rule!.content).toContain("Do not implement that worker stage");
    expect(rule!.content).toContain("`TypeName` / `Role`");
    expect(rule!.content).toContain("configured model");
    expect(rule!.content).toContain("server AgentRunner");
    expect(rule!.content).toContain("live-shell` agmsg worker");
    expect(rule!.content).toContain("Use only the injected dashboard endpoint");
    expect(rule!.content).toContain("that exact value");
    expect(rule!.content).toContain("never print the token itself");
    expect(rule!.content).toContain("Question freshness before every request");
    expect(rule!.content).toContain("retry only if the values demonstrably changed");
    expect(rule!.content).toContain("do not treat session failure as worker failure");

    for (const cli of ["claude", "codex", "gemini"] as const) {
      const paths = getRenderer(cli)!
        .render(dispatch!, { projectRoot, cli })
        .map((file) => file.path);
      expect(paths).not.toContain(".agent/rules/ithy-opsx-dispatch.md");
    }
  });

  it("renders a thin Codex Skill entrypoint for single-change dispatch", async () => {
    const sources = await discoverSkillSources(SKILLS_DIR);
    const dispatch = sources.find((source) => source.id === "ithy-opsx-dispatch");
    expect(dispatch).toBeDefined();

    const files = getRenderer("codex")!.render(dispatch!, {
      projectRoot,
      cli: "codex",
    });
    const prompt = files.find(
      (file) => file.path === ".codex/prompts/ithy-opsx-dispatch.md",
    );
    const skill = files.find(
      (file) => file.path === ".codex/skills/ithy-opsx-dispatch/SKILL.md",
    );
    expect(prompt).toBeDefined();
    expect(skill).toBeDefined();
    expect(prompt!.content).toContain("openspec-apply-change");
    expect(prompt!.content).toContain("Do not archive the change.");
    expect(prompt!.content).toContain("Do not sync change specs into the main specs.");
    expect(prompt!.content).toContain("Do not create a git commit");

    const fm = /^---\n([\s\S]+?)\n---/.exec(skill!.content);
    expect(fm).not.toBeNull();
    const metadata = parseYaml(fm![1]);
    expect(Object.keys(metadata).sort()).toEqual(["description", "name"]);
    expect(metadata.name).toBe("ithy-opsx-dispatch");
    expect(metadata.description).toContain("ithy-opsx-dispatch CHANGE_ID");
    expect(metadata.description).toContain("Do not substitute dispatch-multi");
    expect(skill!.content).toContain(".codex/prompts/ithy-opsx-dispatch.md");
    expect(skill!.content).toContain("without replacing it with");
  });

  it("converts Claude commands to prompts and mirrors only Claude skills", async () => {
    const commands = join(projectRoot, ".claude", "commands", "ithy-opsx");
    mkdirSync(commands, { recursive: true });
    writeFileSync(join(commands, "review.md"), [
      "---", "description: Review a change", "---", "",
      "/ithy-opsx:verify ${change_id}",
      "<!-- codex-preserve-start -->",
      "codex=ithy-opsx-review legacy=/ithy-opsx:review",
      "<!-- codex-preserve-end -->", "",
    ].join("\n"));
    writeFileSync(join(commands, "verify.md"), [
      "---", "description: Verify a change", "---", "", "/opsx:apply ${change_id}", "",
    ].join("\n"));
    const claudeArchiveSkill = join(projectRoot, ".claude", "skills", "ithy-opsx-archive");
    mkdirSync(claudeArchiveSkill, { recursive: true });
    writeFileSync(join(claudeArchiveSkill, "SKILL.md"), "/ithy-opsx:archive ${change_id}\n");
    const claudeProbeSkill = join(projectRoot, ".claude", "skills", "ithy-opsx-test-probe");
    mkdirSync(claudeProbeSkill, { recursive: true });
    writeFileSync(
      join(claudeProbeSkill, "SKILL.md"),
      readFileSync(join(REPO, ".claude", "skills", "ithy-opsx-test-probe", "SKILL.md"), "utf8"),
    );

    const result = await installSkills({
      projectRoot,
      selectedClis: ["codex"],
      sourcesDir: SKILLS_DIR,
    });

    expect(result.errors).toEqual([]);
    expect(existsSync(join(projectRoot, ".codex/prompts/ithy-opsx-review.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".codex/prompts/ithy-opsx-verify.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".codex/skills/ithy-opsx-review/SKILL.md"))).toBe(false);
    expect(existsSync(join(projectRoot, ".codex/skills/ithy-opsx-verify/SKILL.md"))).toBe(false);
    expect(existsSync(join(projectRoot, ".codex/skills/ithy-opsx-archive/SKILL.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".codex/skills/ithy-opsx-dispatch/SKILL.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".codex/skills/ithy-opsx-test-probe/SKILL.md"))).toBe(true);
    expect(readFileSync(join(projectRoot, ".codex/prompts/ithy-opsx-review.md"), "utf8"))
      .toContain("ithy-opsx-verify ${change_id}");
    expect(readFileSync(join(projectRoot, ".codex/prompts/ithy-opsx-review.md"), "utf8"))
      .toContain("codex=ithy-opsx-review legacy=/ithy-opsx:review");
    expect(readFileSync(join(projectRoot, ".codex/prompts/ithy-opsx-verify.md"), "utf8"))
      .toContain("openspec-apply-change ${change_id}");
    expect(readFileSync(join(projectRoot, ".codex/skills/ithy-opsx-archive/SKILL.md"), "utf8"))
      .toContain("ithy-opsx-archive ${change_id}");
    expect(readFileSync(join(projectRoot, ".codex/skills/ithy-opsx-dispatch/SKILL.md"), "utf8"))
      .toContain(".codex/prompts/ithy-opsx-dispatch.md");
    expect(readFileSync(join(projectRoot, ".codex/skills/ithy-opsx-test-probe/SKILL.md"), "utf8"))
      .toContain('"probe": "ithy-opsx-test-probe"');
  });

  it("selecting multiple CLIs in one call materializes all of them (both skills each)", async () => {
    const result = await installSkills({
      projectRoot,
      selectedClis: ["claude", "antigravity", "cursor"],
      sourcesDir: SKILLS_DIR,
    });
    expect(result.errors).toEqual([]);
    // 2 skills × 3 CLIs.
    expect(result.written.length).toBeGreaterThanOrEqual(6);
    // Claude: both skills at .claude/commands/<ns>/<cmd>.md.
    expect(existsSync(join(projectRoot, ".claude/commands/ithy-opsx/apply.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".claude/commands/ithy-opsx/dispatch.md"))).toBe(true);
    // Antigravity (agy): flat .agent/workflows/<ns>-<cmd>.md — Agy only
    // discovers workflow files directly under the workflows directory.
    expect(existsSync(join(projectRoot, ".agent/workflows/ithy-opsx-apply.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".agent/workflows/ithy-opsx-dispatch.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".agent/rules/ithy-opsx-dispatch.md"))).toBe(true);
    // Cursor: flat .cursor/commands/<ns>-<cmd>.md — matches openspec adapter.
    expect(existsSync(join(projectRoot, ".cursor/commands/ithy-opsx-apply.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".cursor/commands/ithy-opsx-dispatch.md"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Legacy .agents/workflows/ → .agent/workflows/ migration for the antigravity
// (agy) CLI. Older ithyno builds wrote the plural directory; current Agy uses
// the singular directory.
// ---------------------------------------------------------------------------

describe("migrateLegacyAntigravityDir — unit", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "ithyno-agy-migrate-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  async function migrate(opts?: { dryRun?: boolean }) {
    const mod = await import("./skill-renderer/migrate-agy.js");
    return mod.migrateLegacyAntigravityDir(projectRoot, opts ?? {});
  }

  function seedLegacy(basename: string, body = "legacy body\n") {
    const dir = join(projectRoot, ".agents", "workflows");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, basename), body, "utf-8");
  }

  function seedTarget(basename: string, body = "target body\n") {
    const dir = join(projectRoot, ".agent", "workflows");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, basename), body, "utf-8");
  }

  it("moves .agents/workflows/*.md → .agent/workflows/ and cleans empty parents", async () => {
    seedLegacy("opsx-propose.md");
    seedLegacy("opsx-apply.md");
    const result = await migrate();
    expect(result.moved.sort()).toEqual([
      ".agents/workflows/opsx-apply.md",
      ".agents/workflows/opsx-propose.md",
    ]);
    expect(result.skipped).toEqual([]);
    expect(existsSync(join(projectRoot, ".agent/workflows/opsx-propose.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".agent/workflows/opsx-apply.md"))).toBe(true);
    // Legacy dir + parent cleaned.
    expect(existsSync(join(projectRoot, ".agents/workflows"))).toBe(false);
    expect(existsSync(join(projectRoot, ".agents"))).toBe(false);
  });

  it("skips when target already exists (never clobbers renderer output)", async () => {
    seedLegacy("opsx-apply.md", "STALE\n");
    seedTarget("opsx-apply.md", "NEW\n");
    const result = await migrate();
    expect(result.moved).toEqual([]);
    expect(result.skipped).toEqual([
      { path: ".agents/workflows/opsx-apply.md", reason: "target exists" },
    ]);
    // Both files unchanged.
    expect(readFileSync(join(projectRoot, ".agents/workflows/opsx-apply.md"), "utf-8")).toBe(
      "STALE\n",
    );
    expect(readFileSync(join(projectRoot, ".agent/workflows/opsx-apply.md"), "utf-8")).toBe(
      "NEW\n",
    );
    // .agents/ remains because it's non-empty (the skipped file is still there).
    expect(existsSync(join(projectRoot, ".agents/workflows/opsx-apply.md"))).toBe(true);
  });

  it("is idempotent — second call finds nothing and returns empty", async () => {
    seedLegacy("opsx-propose.md");
    const first = await migrate();
    expect(first.moved).toEqual([".agents/workflows/opsx-propose.md"]);
    const second = await migrate();
    expect(second.moved).toEqual([]);
    expect(second.skipped).toEqual([]);
  });

  it("is a clean no-op when legacy .agents/ does not exist", async () => {
    const result = await migrate();
    expect(result.moved).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("dry-run reports the plan without touching disk", async () => {
    seedLegacy("opsx-propose.md");
    const result = await migrate({ dryRun: true });
    expect(result.moved).toEqual([".agents/workflows/opsx-propose.md"]);
    expect(result.skipped).toEqual([]);
    // Source untouched, target absent.
    expect(existsSync(join(projectRoot, ".agents/workflows/opsx-propose.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".agent/workflows/opsx-propose.md"))).toBe(false);
  });

  it("leaves non-.md files in legacy .agents/ untouched (respects user files)", async () => {
    // The migration cares about workflow .md files, not user artifacts
    // that might live alongside them.
    seedLegacy("opsx-apply.md");
    const strayDir = join(projectRoot, ".agents");
    writeFileSync(join(strayDir, "user-note.txt"), "keep me\n", "utf-8");
    const result = await migrate();
    expect(result.moved).toEqual([".agents/workflows/opsx-apply.md"]);
    // .agents/ NOT rmdir'd because user-note.txt keeps it non-empty.
    expect(existsSync(join(projectRoot, ".agents/user-note.txt"))).toBe(true);
    // But the empty workflows/ subdir IS gone.
    expect(existsSync(join(projectRoot, ".agents/workflows"))).toBe(false);
  });

  it("flattens nested singular Agy workflows into discoverable files", async () => {
    const nestedDir = join(projectRoot, ".agent", "workflows", "ithy-opsx");
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(join(nestedDir, "dispatch.md"), "nested\n", "utf-8");

    const result = await migrate();

    expect(result.moved).toEqual([".agent/workflows/ithy-opsx/dispatch.md"]);
    expect(readFileSync(
      join(projectRoot, ".agent/workflows/ithy-opsx-dispatch.md"),
      "utf-8",
    )).toBe("nested\n");
    expect(existsSync(nestedDir)).toBe(false);
  });

  it("flattens nested plural Agy workflows into the singular root", async () => {
    const nestedDir = join(projectRoot, ".agents", "workflows", "ithy-opsx");
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(join(nestedDir, "review.md"), "nested plural\n", "utf-8");

    const result = await migrate();

    expect(result.moved).toEqual([".agents/workflows/ithy-opsx/review.md"]);
    expect(readFileSync(
      join(projectRoot, ".agent/workflows/ithy-opsx-review.md"),
      "utf-8",
    )).toBe("nested plural\n");
    expect(existsSync(join(projectRoot, ".agents"))).toBe(false);
  });
});

describe("installSkills — antigravity migration wire-up", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "ithyno-agy-install-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function seedLegacy(basename: string, body = "legacy body\n") {
    const dir = join(projectRoot, ".agents", "workflows");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, basename), body, "utf-8");
  }

  it("installSkills invokes the migration when antigravity is selected", async () => {
    seedLegacy("opsx-propose.md");
    seedLegacy("opsx-apply.md");
    const result = await installSkills({
      projectRoot,
      selectedClis: ["antigravity"],
      sourcesDir: SKILLS_DIR,
    });
    expect(result.errors).toEqual([]);
    // Two entries after copy-claude-ithy-opsx: MOVE + COPY. Find MOVE
    // via kind field so the assertion stays robust to entry order.
    expect(result.migrations).toHaveLength(2);
    const moveEntry = result.migrations.find((m) => m.kind === "move");
    expect(moveEntry).toBeDefined();
    expect(moveEntry!.cli).toBe("antigravity");
    expect(moveEntry!.moved!.sort()).toEqual([
      ".agents/workflows/opsx-apply.md",
      ".agents/workflows/opsx-propose.md",
    ]);
    // Files landed at .agent/workflows/.
    expect(existsSync(join(projectRoot, ".agent/workflows/opsx-propose.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".agent/workflows/opsx-apply.md"))).toBe(true);
    // Renderer's own ithy-opsx-* output landed alongside, under the
    // nested `<ns>/<cmd>.md` shape (openspec-flat vs renderer-nested
    // don't collide because they use different filename shapes).
    expect(existsSync(join(projectRoot, ".agent/workflows/ithy-opsx-apply.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".agent/workflows/ithy-opsx-dispatch.md"))).toBe(true);
  });

  it("emits an empty migration entry when antigravity is selected with nothing to migrate", async () => {
    // No legacy .agents/ seeded — helper finds nothing, but the entry is still
    // present so callers can distinguish "ran, found nothing" from
    // "not run for this CLI" (the latter has no entry at all).
    const result = await installSkills({
      projectRoot,
      selectedClis: ["antigravity"],
      sourcesDir: SKILLS_DIR,
    });
    expect(result.errors).toEqual([]);
    // Two entries: the MOVE migration + the COPY hook, both empty
    // (no .agents/ or .claude/commands/ithy-opsx/ seeded).
    expect(result.migrations).toEqual([
      { cli: "antigravity", kind: "move", moved: [], skipped: [] },
      { cli: "antigravity", kind: "copy", copied: [], skipped: [] },
    ]);
  });

  it("does NOT invoke the migration when antigravity is not selected", async () => {
    seedLegacy("opsx-propose.md");
    const result = await installSkills({
      projectRoot,
      selectedClis: ["claude"],
      sourcesDir: SKILLS_DIR,
    });
    expect(result.migrations).toEqual([]);
    // Legacy .agents/ file untouched.
    expect(existsSync(join(projectRoot, ".agents/workflows/opsx-propose.md"))).toBe(true);
  });

  it("migration + install respect target-conflict skip semantics", async () => {
    // Both source AND target already exist for the same basename —
    // classic case where the user has an old .agents/workflows/opsx-apply.md
    // (from a prior openspec init) AND already has a fresher
    // .agent/workflows/opsx-apply.md (from some later step).
    // Migration MUST skip: never clobber the newer target.
    const legacyDir = join(projectRoot, ".agents", "workflows");
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, "opsx-apply.md"), "STALE\n", "utf-8");
    const targetDir = join(projectRoot, ".agent", "workflows");
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, "opsx-apply.md"), "NEW\n", "utf-8");

    const result = await installSkills({
      projectRoot,
      selectedClis: ["antigravity"],
      sourcesDir: SKILLS_DIR,
    });

    expect(result.errors).toEqual([]);
    // Legacy file untouched, reported as skipped.
    expect(result.migrations[0].moved).toEqual([]);
    expect(result.migrations[0].skipped).toEqual([
      { path: ".agents/workflows/opsx-apply.md", reason: "target exists" },
    ]);
    expect(readFileSync(join(legacyDir, "opsx-apply.md"), "utf-8")).toBe("STALE\n");
    // Target untouched.
    expect(readFileSync(join(targetDir, "opsx-apply.md"), "utf-8")).toBe("NEW\n");
  });

  it("dry-run migration reports plan without touching disk", async () => {
    seedLegacy("opsx-propose.md");
    const result = await installSkills({
      projectRoot,
      selectedClis: ["antigravity"],
      sourcesDir: SKILLS_DIR,
      dryRun: true,
    });
    expect(result.errors).toEqual([]);
    expect(result.migrations[0].moved).toEqual([".agents/workflows/opsx-propose.md"]);
    // Source untouched, target absent.
    expect(existsSync(join(projectRoot, ".agents/workflows/opsx-propose.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".agent/workflows/opsx-propose.md"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// copy-claude-ithy-opsx-into-agents-workflows-for-agy
// COPY .claude/commands/ithy-opsx/*.md → .agent/workflows/ithy-opsx-*.md
// when antigravity is selected. Non-destructive to .claude/ source.
// ---------------------------------------------------------------------------

describe("copyClaudeIthyOpsxCommandsToAgent — unit", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "ithyno-agy-copy-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  async function copy(opts?: { dryRun?: boolean }) {
    const mod = await import("./skill-renderer/migrate-agy.js");
    return mod.copyClaudeIthyOpsxCommandsToAgent(projectRoot, opts ?? {});
  }

  function seedClaude(basename: string, body = "claude legacy body\n") {
    const dir = join(projectRoot, ".claude", "commands", "ithy-opsx");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, basename), body, "utf-8");
  }

  function seedAgentTarget(basename: string, body = "target body\n") {
    const dir = join(projectRoot, ".agent", "workflows");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `ithy-opsx-${basename}`), body, "utf-8");
  }

  it("copies .claude/commands/ithy-opsx/*.md → .agent/workflows/ithy-opsx-", async () => {
    seedClaude("dispatch.md", "DISPATCH BODY\n");
    seedClaude("merge.md", "MERGE BODY\n");
    const result = await copy();
    expect(result.copied.sort()).toEqual([
      ".claude/commands/ithy-opsx/dispatch.md",
      ".claude/commands/ithy-opsx/merge.md",
    ]);
    expect(result.skipped).toEqual([]);
    // Target files present with copied content.
    expect(readFileSync(join(projectRoot, ".agent/workflows/ithy-opsx-dispatch.md"), "utf-8")).toBe(
      "DISPATCH BODY\n",
    );
    expect(readFileSync(join(projectRoot, ".agent/workflows/ithy-opsx-merge.md"), "utf-8")).toBe(
      "MERGE BODY\n",
    );
    // Source files unchanged (COPY semantics).
    expect(readFileSync(join(projectRoot, ".claude/commands/ithy-opsx/dispatch.md"), "utf-8")).toBe(
      "DISPATCH BODY\n",
    );
    expect(readFileSync(join(projectRoot, ".claude/commands/ithy-opsx/merge.md"), "utf-8")).toBe(
      "MERGE BODY\n",
    );
    // .claude/ dir preserved (nothing deleted).
    expect(existsSync(join(projectRoot, ".claude/commands/ithy-opsx"))).toBe(true);
  });

  it("normalizes Claude frontmatter and command references for Agy", async () => {
    seedClaude("review.md", [
      "---",
      'name: "ITHY-OPSX: Review"',
      "description: Review a change",
      "category: Workflow",
      "---",
      "",
      "Run /opsx:apply then /ithy-opsx:verify.",
      "",
    ].join("\n"));

    await copy();
    const rendered = readFileSync(
      join(projectRoot, ".agent/workflows/ithy-opsx-review.md"),
      "utf-8",
    );
    expect(rendered).toContain("description: Review a change");
    expect(rendered).not.toContain("name:");
    expect(rendered).not.toContain("category:");
    expect(rendered).toContain("/opsx-apply");
    expect(rendered).toContain("/ithy-opsx-verify");
    expect(rendered).not.toMatch(/\/(?:ithy-)?opsx:/);
  });

  it("skips when target already exists (never clobbers renderer output)", async () => {
    seedClaude("dispatch.md", "STALE\n");
    seedAgentTarget("dispatch.md", "NEW\n");
    const result = await copy();
    expect(result.copied).toEqual([]);
    expect(result.skipped).toEqual([
      { path: ".claude/commands/ithy-opsx/dispatch.md", reason: "target exists" },
    ]);
    // Both files unchanged.
    expect(readFileSync(join(projectRoot, ".claude/commands/ithy-opsx/dispatch.md"), "utf-8")).toBe(
      "STALE\n",
    );
    expect(readFileSync(join(projectRoot, ".agent/workflows/ithy-opsx-dispatch.md"), "utf-8")).toBe(
      "NEW\n",
    );
  });

  it("is idempotent — second call finds all targets present, returns empty copied", async () => {
    seedClaude("dispatch.md");
    const first = await copy();
    expect(first.copied).toEqual([".claude/commands/ithy-opsx/dispatch.md"]);
    const second = await copy();
    expect(second.copied).toEqual([]);
    expect(second.skipped).toEqual([
      { path: ".claude/commands/ithy-opsx/dispatch.md", reason: "target exists" },
    ]);
  });

  it("is a clean no-op when .claude/commands/ithy-opsx/ does not exist", async () => {
    const result = await copy();
    expect(result.copied).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("dry-run reports the plan without touching disk", async () => {
    seedClaude("dispatch.md");
    const result = await copy({ dryRun: true });
    expect(result.copied).toEqual([".claude/commands/ithy-opsx/dispatch.md"]);
    expect(result.skipped).toEqual([]);
    // Source untouched, target absent.
    expect(existsSync(join(projectRoot, ".claude/commands/ithy-opsx/dispatch.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".agent/workflows/ithy-opsx-dispatch.md"))).toBe(false);
  });
});

describe("installSkills — claude→agent copy wire-up", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "ithyno-agy-copy-install-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function seedClaude(basename: string, body = "claude legacy\n") {
    const dir = join(projectRoot, ".claude", "commands", "ithy-opsx");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, basename), body, "utf-8");
  }

  it("installSkills invokes the copy hook when antigravity is selected", async () => {
    seedClaude("dispatch.md");
    seedClaude("merge.md");
    const result = await installSkills({
      projectRoot,
      selectedClis: ["antigravity"],
      sourcesDir: SKILLS_DIR,
    });
    expect(result.errors).toEqual([]);
    // Two migration entries: the legacy-dir MOVE + the claude COPY.
    expect(result.migrations).toHaveLength(2);
    const moveEntry = result.migrations.find((m) => m.kind === "move");
    const copyEntry = result.migrations.find((m) => m.kind === "copy");
    expect(moveEntry, "move entry missing").toBeDefined();
    expect(copyEntry, "copy entry missing").toBeDefined();
    expect(copyEntry!.cli).toBe("antigravity");
    expect(copyEntry!.copied!.sort()).toEqual([
      ".claude/commands/ithy-opsx/dispatch.md",
      ".claude/commands/ithy-opsx/merge.md",
    ]);
    // Copied to target dir.
    expect(existsSync(join(projectRoot, ".agent/workflows/ithy-opsx-dispatch.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".agent/workflows/ithy-opsx-merge.md"))).toBe(true);
    // .claude/ source untouched.
    expect(existsSync(join(projectRoot, ".claude/commands/ithy-opsx/dispatch.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".claude/commands/ithy-opsx/merge.md"))).toBe(true);
  });

  it("copy hook does NOT run when antigravity is not selected", async () => {
    seedClaude("dispatch.md");
    const result = await installSkills({
      projectRoot,
      selectedClis: ["claude"],
      sourcesDir: SKILLS_DIR,
    });
    // No migration entries at all for the claude-only case.
    expect(result.migrations).toEqual([]);
    // .agent/ target NOT created.
    expect(existsSync(join(projectRoot, ".agent/workflows/ithy-opsx-dispatch.md"))).toBe(false);
    // .claude/ source untouched.
    expect(existsSync(join(projectRoot, ".claude/commands/ithy-opsx/dispatch.md"))).toBe(true);
  });

  it("copy hook skips when renderer will write to the same target basename", async () => {
    // Seed .claude/commands/ithy-opsx/apply.md — the antigravity
    // renderer will ALSO write .agent/workflows/ithy-opsx-apply.md
    // (from ithyno/skills/ithy-opsx-apply/). Order-of-operations:
    // copy runs BEFORE render, so at copy time the target is absent
    // and the copy proceeds. Then the renderer overwrites it with
    // its own (correct, universal-source-derived) content.
    seedClaude("apply.md", "STALE CLAUDE COPY\n");
    const result = await installSkills({
      projectRoot,
      selectedClis: ["antigravity"],
      sourcesDir: SKILLS_DIR,
    });
    expect(result.errors).toEqual([]);
    const copyEntry = result.migrations.find((m) => m.kind === "copy");
    expect(copyEntry!.copied).toContain(".claude/commands/ithy-opsx/apply.md");
    // Target has renderer output (GENERATED banner), not the stale copy.
    const finalContent = readFileSync(
      join(projectRoot, ".agent/workflows/ithy-opsx-apply.md"),
      "utf-8",
    );
    expect(finalContent).toContain("GENERATED FILE");
    expect(finalContent).not.toContain("STALE CLAUDE COPY");
  });

  it("dry-run copy reports plan without touching disk", async () => {
    seedClaude("dispatch.md");
    const result = await installSkills({
      projectRoot,
      selectedClis: ["antigravity"],
      sourcesDir: SKILLS_DIR,
      dryRun: true,
    });
    expect(result.errors).toEqual([]);
    const copyEntry = result.migrations.find((m) => m.kind === "copy");
    expect(copyEntry!.copied).toEqual([".claude/commands/ithy-opsx/dispatch.md"]);
    // Source untouched, target absent.
    expect(existsSync(join(projectRoot, ".claude/commands/ithy-opsx/dispatch.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".agent/workflows/ithy-opsx-dispatch.md"))).toBe(false);
  });
});
