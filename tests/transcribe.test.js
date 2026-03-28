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
    expect(result).toBe("Hello there How are you");
  });

  it("trims leading and trailing whitespace on each line", () => {
    const result = parseOutput("   first   \n   second   \n   third   ");
    expect(result).toBe("first second third");
  });

  it("returns empty string for empty input", () => {
    const result = parseOutput("");
    expect(result).toBe("");
  });

  // --- Hallucination filtering ---

  it("filters exact hallucination: 'Thank you'", () => {
    expect(parseOutput("Thank you")).toBe("");
    expect(parseOutput("thank you.")).toBe("");
    expect(parseOutput("Thank you for watching!")).toBe("");
  });

  it("filters exact hallucination: YouTube phrases", () => {
    expect(parseOutput("Like and subscribe")).toBe("");
    expect(parseOutput("See you next time.")).toBe("");
    expect(parseOutput("Don't forget to subscribe")).toBe("");
  });

  it("filters exact hallucination: short filler words", () => {
    expect(parseOutput("you")).toBe("");
    expect(parseOutput("so")).toBe("");
    expect(parseOutput("hmm.")).toBe("");
    expect(parseOutput("okay.")).toBe("");
  });

  it("filters structural hallucinations (punctuation-only)", () => {
    expect(parseOutput("...")).toBe("");
    expect(parseOutput("!!!")).toBe("");
    expect(parseOutput("?!.")).toBe("");
    expect(parseOutput("  - ")).toBe("");
  });

  it("filters bracket/paren tokens", () => {
    expect(parseOutput("[BLANK_AUDIO]")).toBe("");
    expect(parseOutput("(music)")).toBe("");
  });

  it("strips trailing hallucination from real speech", () => {
    expect(parseOutput("Deploy the feature. Thank you.")).toBe(
      "Deploy the feature.",
    );
    expect(parseOutput("Run the tests. Thanks for watching!")).toBe(
      "Run the tests.",
    );
    expect(parseOutput("Okay let's go. Bye.")).toBe("Okay let's go.");
  });

  it("strips multiple trailing hallucination phrases", () => {
    expect(parseOutput("Do it now. Thank you. Goodbye.")).toBe("Do it now.");
  });

  it("detects repetitive loops", () => {
    expect(parseOutput("the the the the the")).toBe("");
    expect(parseOutput("thank thank thank thank")).toBe("");
  });

  it("preserves legitimate text", () => {
    expect(parseOutput("Please deploy the feature to production")).toBe(
      "Please deploy the feature to production",
    );
    expect(parseOutput("Thank you is a common phrase in English")).toBe(
      "Thank you is a common phrase in English",
    );
  });
});
