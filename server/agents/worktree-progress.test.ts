// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { parseTasks } from "../parser/tasks.js";
import type { Progress } from "../model.js";

/**
 * The worktree-progress module wires chokidar + fs I/O together, which is
 * fragile to unit-test in a small file. We test the *contract* it enforces
 * (parse → count → emit only on change) by exercising the pure functions
 * directly: parseTasks + counting + change detection.
 */

function countProgress(list: ReturnType<typeof parseTasks>): Progress {
  let done = 0;
  let total = 0;
  for (const sec of list.sections) {
    for (const t of sec.tasks) {
      total++;
      if (t.checked) done++;
    }
  }
  return { done, total };
}

const A = `## 1. Setup
- [x] 1.1 install
- [ ] 1.2 configure

## 2. Impl
- [ ] 2.1 build
- [ ] 2.2 test
`;

const B = `## 1. Setup
- [x] 1.1 install
- [x] 1.2 configure

## 2. Impl
- [ ] 2.1 build
- [ ] 2.2 test
`;

const B_REORDERED_SAME_COUNTS = `## 2. Impl
- [ ] 2.1 build
- [ ] 2.2 test

## 1. Setup
- [x] 1.1 install
- [x] 1.2 configure
`;

const C = `## 1. Setup
- [x] 1.1 install
- [x] 1.2 configure

## 2. Impl
- [ ] 2.1 build
- [ ] 2.2 test
- [ ] 2.3 verify
`;

describe("worktree-progress: parse + change detection contract", () => {
  it("initial parse yields the expected {done,total}", () => {
    expect(countProgress(parseTasks("/t.md", A))).toEqual({ done: 1, total: 4 });
  });

  it("a tick advances `done` and would emit", () => {
    const p1 = countProgress(parseTasks("/t.md", A));
    const p2 = countProgress(parseTasks("/t.md", B));
    expect(p2).toEqual({ done: 2, total: 4 });
    expect(p2.done === p1.done && p2.total === p1.total).toBe(false);
  });

  it("reordering with the same tick counts would NOT emit", () => {
    const p1 = countProgress(parseTasks("/t.md", B));
    const p2 = countProgress(parseTasks("/t.md", B_REORDERED_SAME_COUNTS));
    expect(p2).toEqual(p1);
    expect(p2.done === p1.done && p2.total === p1.total).toBe(true);
  });

  it("adding a task changes `total` and would emit", () => {
    const p1 = countProgress(parseTasks("/t.md", B));
    const p2 = countProgress(parseTasks("/t.md", C));
    expect(p1).toEqual({ done: 2, total: 4 });
    expect(p2).toEqual({ done: 2, total: 5 });
    expect(p2.done === p1.done && p2.total === p1.total).toBe(false);
  });
});
