// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from "vitest";
import { writeClipboardText } from "./ClipboardCopyButton";

describe("writeClipboardText", () => {
  it("writes the exact value without transforming it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await writeClipboardText("add-search", { writeText });
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith("add-search");
  });

  it("preserves clipboard failures for the shared toast handler", async () => {
    const denied = new Error("permission denied");
    const writeText = vi.fn().mockRejectedValue(denied);
    await expect(writeClipboardText("add-search", { writeText })).rejects.toBe(denied);
  });
});
