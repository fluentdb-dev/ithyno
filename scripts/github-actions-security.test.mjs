// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const WORKFLOW_DIR = join(process.cwd(), ".github", "workflows");
const SHA_USE = /^\s*uses:\s*[^\s@]+@[0-9a-f]{40}\s+#\s+v\d/i;
const ANY_USE = /^\s*uses:/;

async function workflows() {
  const names = (await readdir(WORKFLOW_DIR)).filter((name) => /\.ya?ml$/.test(name));
  return Promise.all(names.map(async (name) => ({
    name,
    source: await readFile(join(WORKFLOW_DIR, name), "utf8"),
  })));
}

describe("GitHub Actions security policy", () => {
  it("pins every Action to a full SHA and documents its release", async () => {
    for (const workflow of await workflows()) {
      for (const line of workflow.source.split("\n").filter((value) => ANY_USE.test(value))) {
        expect(line, `${workflow.name}: mutable or unannotated Action reference`).toMatch(SHA_USE);
      }
    }
  });

  it("declares top-level permissions in every workflow", async () => {
    for (const workflow of await workflows()) {
      const document = parse(workflow.source);
      expect(document.permissions, `${workflow.name}: missing top-level permissions`).toBeDefined();
    }
  });

  it("allows write permissions only for the documented publishing jobs", async () => {
    const allowedWrites = new Set([
      "codeql.yml:analyze:security-events",
      "release.yml:publish:contents",
      "scorecard.yml:analysis:id-token",
      "scorecard.yml:analysis:security-events",
    ]);
    const actualWrites = new Set();

    for (const workflow of await workflows()) {
      const document = parse(workflow.source);
      const jobs = document.jobs ?? {};
      for (const [jobName, job] of Object.entries(jobs)) {
        const permissions = job.permissions ?? {};
        for (const [permission, access] of Object.entries(permissions)) {
          if (access === "write") actualWrites.add(`${workflow.name}:${jobName}:${permission}`);
        }
      }
    }

    expect(actualWrites).toEqual(allowedWrites);
  });

  it("never uses pull_request_target", async () => {
    for (const workflow of await workflows()) {
      expect(workflow.source, workflow.name).not.toMatch(/^\s*pull_request_target:/m);
    }
  });
});
