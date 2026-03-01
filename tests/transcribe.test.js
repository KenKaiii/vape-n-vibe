import { describe, it, expect } from "vitest";
import { parseOutput } from "../src/main/transcribe";

describe("parseOutput", () => {
  it("trims and joins multi-line output", () => {
    const result = parseOutput("  hello  \n  world  \n");
    expect(result).toBe("hello world");
  });

  it("filters empty lines", () => {
    const result = parseOutput("hello\n\n\nworld\n\n");
    expect(result).toBe("hello world");
  });

  it("returns empty string for whitespace-only output", () => {
    const result = parseOutput("\n\n");
    expect(result).toBe("");
  });

  it("handles single line", () => {
    const result = parseOutput("hello world\n");
    expect(result).toBe("hello world");
  });

  it("handles whisper timestamp-like lines mixed in", () => {
    const result = parseOutput(
      "[00:00.000 --> 00:02.000]  Hello there\n  How are you\n",
    );
    expect(result).toBe("[00:00.000 --> 00:02.000]  Hello there How are you");
  });

  it("trims leading and trailing whitespace on each line", () => {
    const result = parseOutput("   first   \n   second   \n   third   ");
    expect(result).toBe("first second third");
  });

  it("returns empty string for empty input", () => {
    const result = parseOutput("");
    expect(result).toBe("");
  });
});
