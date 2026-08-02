// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Gemini CLI renderer for the cross-CLI skill installer.
 *
 * Emits `.gemini/commands/<namespace>/<command>.toml` — matches
 * openspec's gemini adapter (`getFilePath: .gemini/commands/opsx/
 * <id>.toml`). Gemini discovers commands as TOML files, NOT
 * markdown. The file wraps our SKILL.md body in a TOML
 * `prompt = """..."""` multiline string alongside a top-level
 * `description = "..."`.
 */
import type { Renderer, RenderedFile, SkillSource } from "../types.js";

function expandTokens(body: string): string {
  return body
    .replace(
      /<capability:subagent_spawn>/g,
      () => "invoke via a subprocess `gemini` call",
    )
    .replace(/<capability:file_write>/g, () => "write with your file tools")
    .replace(/<capability:bash>/g, () => "run via the shell");
}

function fillPlaceholders(body: string, source: SkillSource): string {
  const ns = source.manifest.namespace;
  const cmd = source.manifest.command;
  return body.replace(/\{\{namespace\}\}/g, () => ns).replace(/\{\{command\}\}/g, () => cmd);
}

function escapeTomlBasicString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function escapeTomlMultilineBasicString(value: string): string {
  // TOML """..."""  strings allow raw newlines; escape any embedded
  // triple-quote sequence and lone backslashes.
  return value.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"');
}

function generatedBannerToml(source: SkillSource): string {
  return [
    "# GENERATED FILE — do not hand-edit.",
    `# Source: ithyno/skills/${source.id}/{SKILL.md, manifest.yaml}`,
    "# Regenerate: openspec init --skills-only",
  ].join("\n");
}

export const geminiRenderer: Renderer = {
  cli: "gemini",
  render(source: SkillSource): RenderedFile[] {
    // openspec's gemini adapter path shape: <ns>/<cmd>.toml. Preserve
    // the nested-directory form so the namespace shows up as a Gemini
    // command group.
    const path = `.gemini/commands/${source.manifest.namespace}/${source.manifest.command}.toml`;
    const body = expandTokens(fillPlaceholders(source.body.trimEnd(), source));
    const description = source.manifest.description.replace(/\s+/g, " ").trim();
    const content = [
      generatedBannerToml(source),
      "",
      `description = "${escapeTomlBasicString(description)}"`,
      "",
      "prompt = \"\"\"",
      escapeTomlMultilineBasicString(body),
      "\"\"\"",
      "",
    ].join("\n");
    return [{ path, content, mode: "create" }];
  },
};
