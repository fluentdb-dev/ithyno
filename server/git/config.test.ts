import { describe, it, expect } from "vitest";
import { parseShowScope } from "./config.js";

describe("parseShowScope", () => {
  it("parses a local-scoped value", () => {
    expect(parseShowScope("local\tAda Lovelace\n")).toEqual({
      scope: "local",
      value: "Ada Lovelace",
    });
  });

  it("parses a global-scoped value", () => {
    expect(parseShowScope("global\tada@example.com")).toEqual({
      scope: "global",
      value: "ada@example.com",
    });
  });

  it("keeps trailing content inside the value verbatim (values may contain tabs)", () => {
    // git's actual output uses a tab separator; anything after the first tab is
    // the value, whitespace and all.
    expect(parseShowScope("local\tsome  value with spaces\n")).toEqual({
      scope: "local",
      value: "some  value with spaces",
    });
  });

  it("returns null on empty input", () => {
    expect(parseShowScope("")).toBeNull();
    expect(parseShowScope("\n")).toBeNull();
  });

  it("returns null when no tab separator is present", () => {
    expect(parseShowScope("local Ada")).toBeNull();
  });

  it("returns null on unknown scope", () => {
    expect(parseShowScope("weird\tvalue")).toBeNull();
  });

  it("accepts the system scope", () => {
    expect(parseShowScope("system\troot@host")).toEqual({
      scope: "system",
      value: "root@host",
    });
  });
});
