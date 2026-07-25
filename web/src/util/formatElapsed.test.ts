// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { formatElapsed, formatElapsedSince } from "./formatElapsed";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatElapsed (annotate-cards-with-worker-job-state)", () => {
  it("< 60s renders bare seconds", () => {
    expect(formatElapsed(12 * SEC)).toBe("12s");
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(59 * SEC + 999)).toBe("59s");
  });

  it("< 1h renders minutes + seconds, dropping a zero seconds part", () => {
    expect(formatElapsed(MIN + 5 * SEC)).toBe("1m 5s");
    expect(formatElapsed(3 * MIN)).toBe("3m");
    expect(formatElapsed(59 * MIN + 59 * SEC)).toBe("59m 59s");
  });

  it("< 24h renders hours + minutes, dropping a zero minutes part", () => {
    expect(formatElapsed(3 * HOUR + 12 * MIN)).toBe("3h 12m");
    expect(formatElapsed(HOUR)).toBe("1h");
    // Seconds are discarded once we are into the hours range.
    expect(formatElapsed(HOUR + 2 * MIN + 30 * SEC)).toBe("1h 2m");
  });

  it(">= 24h renders days + hours, dropping a zero hours part", () => {
    expect(formatElapsed(DAY + 4 * HOUR)).toBe("1d 4h");
    expect(formatElapsed(DAY)).toBe("1d");
    expect(formatElapsed(3 * DAY + 23 * HOUR + 59 * MIN)).toBe("3d 23h");
  });

  it("clamps negative / non-finite input to 0s (clock skew guard)", () => {
    expect(formatElapsed(-5 * MIN)).toBe("0s");
    expect(formatElapsed(Number.NaN)).toBe("0s");
    expect(formatElapsed(Number.POSITIVE_INFINITY)).toBe("0s");
  });

  it("formatElapsedSince derives from an absolute timestamp", () => {
    const now = 1_700_000_000_000;
    expect(formatElapsedSince(now - 45 * SEC, now)).toBe("45s");
    expect(formatElapsedSince(now + 10 * SEC, now)).toBe("0s");
  });
});
