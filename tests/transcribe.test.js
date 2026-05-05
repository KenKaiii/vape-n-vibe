import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseOutput, transcribe } from "../src/main/transcribe";

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

  // --- Default exact:true keeps full-transcription behaviour ---

  it("defaults to exact:true (full-transcription filtering)", () => {
    // Calling with no options must still drop exact-match hallucinations.
    expect(parseOutput("okay")).toBe("");
    expect(parseOutput("yeah")).toBe("");
    expect(parseOutput("so")).toBe("");
    expect(parseOutput("thank you")).toBe("");
  });

  it("exact:true explicit — still filters exact hallucinations", () => {
    expect(parseOutput("okay", { exact: true })).toBe("");
    expect(parseOutput("Thanks for watching!", { exact: true })).toBe("");
    expect(parseOutput("you", { exact: true })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// transcribe() short-circuit on too-short / silent audio
// ---------------------------------------------------------------------------
//
// These tests assert two things:
//   1. transcribe() returns "" without invoking the whisper server when
//      analyzeWav() reports !hasSpeech (single source of truth for the
//      duration/silence threshold lives in transcribe.js).
//   2. When the caller passes a pre-loaded `rawWav` + `analysis`,
//      transcribe() does NOT re-read the file from disk — the pipeline
//      relies on this to avoid a double fs.readFile per recording.

const WAV_HEADER = 44;
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const SEGMENT_SAMPLES = Math.floor(SAMPLE_RATE * 0.05);
const SEGMENT_BYTES = SEGMENT_SAMPLES * BYTES_PER_SAMPLE;

function makeWav(pcmData) {
  const buf = Buffer.alloc(WAV_HEADER + pcmData.length);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + pcmData.length, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
  buf.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(pcmData.length, 40);
  pcmData.copy(buf, WAV_HEADER);
  return buf;
}

function makePcmSegments(numSegments, sample) {
  const buf = Buffer.alloc(numSegments * SEGMENT_BYTES, 0);
  for (let s = 0; s < numSegments; s++) {
    for (let i = 0; i < SEGMENT_SAMPLES; i++) {
      buf.writeInt16LE(sample, s * SEGMENT_BYTES + i * BYTES_PER_SAMPLE);
    }
  }
  return buf;
}

describe("transcribe() short-circuit", () => {
  it("returns empty string for too-short audio (< 0.5s) read from disk", async () => {
    // 0.4s of loud audio — below the 0.5s minimum.
    const wav = makeWav(makePcmSegments(8, 5000));
    const tmp = path.join(os.tmpdir(), `vapenvibe-test-${Date.now()}.wav`);
    await fs.writeFile(tmp, wav);
    try {
      const result = await transcribe(tmp, "auto");
      expect(result).toBe("");
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  });

  it("returns empty string for fully silent audio read from disk", async () => {
    // 1s of silent audio — passes duration but fails RMS gate.
    const wav = makeWav(makePcmSegments(20, 10));
    const tmp = path.join(os.tmpdir(), `vapenvibe-test-${Date.now()}.wav`);
    await fs.writeFile(tmp, wav);
    try {
      const result = await transcribe(tmp, "auto");
      expect(result).toBe("");
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  });

  it("honors pre-supplied rawWav + analysis (no fs.readFile)", async () => {
    // If transcribe() actually re-read this nonexistent path it would
    // throw ENOENT.  The fact that it returns "" cleanly proves the
    // file-read path is bypassed when rawWav + analysis are provided.
    const wav = makeWav(makePcmSegments(20, 10)); // silent buffer
    const result = await transcribe("/nonexistent/path.wav", "auto", {
      rawWav: wav,
      analysis: { hasSpeech: false, duration: 1.0 },
    });
    expect(result).toBe("");
  });

  it("honors pre-supplied analysis result (does not re-analyze)", async () => {
    // Hand transcribe() a buffer that *would* analyze as speech, but
    // tell it the analysis says hasSpeech=false.  It must trust the
    // supplied analysis and short-circuit — proving analyzeWav is not
    // called twice.
    const speechWav = makeWav(makePcmSegments(20, 5000));
    const result = await transcribe("/nonexistent/path.wav", "auto", {
      rawWav: speechWav,
      analysis: { hasSpeech: false, duration: 1.0 },
    });
    expect(result).toBe("");
  });
});

describe("parseOutput with { exact: false } (partials)", () => {
  it("preserves plausible single-word partial utterances", () => {
    // These are the canonical regression cases — short partials that
    // overlap the hallucination list but are real speech mid-recording.
    expect(parseOutput("okay", { exact: false })).toBe("okay");
    expect(parseOutput("yeah", { exact: false })).toBe("yeah");
    expect(parseOutput("so", { exact: false })).toBe("so");
    expect(parseOutput("hmm", { exact: false })).toBe("hmm");
    expect(parseOutput("oh", { exact: false })).toBe("oh");
    expect(parseOutput("you", { exact: false })).toBe("you");
  });

  it("preserves trailing punctuation on partials", () => {
    expect(parseOutput("okay.", { exact: false })).toBe("okay.");
    expect(parseOutput("yeah,", { exact: false })).toBe("yeah,");
  });

  it("still applies structural filtering to partials", () => {
    expect(parseOutput("...", { exact: false })).toBe("");
    expect(parseOutput("!!!", { exact: false })).toBe("");
    expect(parseOutput("[BLANK_AUDIO]", { exact: false })).toBe("");
    expect(parseOutput("(music)", { exact: false })).toBe("");
    expect(parseOutput("", { exact: false })).toBe("");
  });

  it("still detects repetitive loops on partials", () => {
    expect(parseOutput("the the the the the", { exact: false })).toBe("");
    expect(parseOutput("okay okay okay okay", { exact: false })).toBe("");
  });

  it("still strips trailing hallucination phrases on partials", () => {
    // Trailing-phrase strip is structural cleanup, not exact filtering,
    // so it stays on for partials too.
    expect(
      parseOutput("Deploy the feature. Thank you.", { exact: false }),
    ).toBe("Deploy the feature.");
  });

  it("preserves legitimate multi-word partials", () => {
    expect(parseOutput("Please deploy the feature", { exact: false })).toBe(
      "Please deploy the feature",
    );
  });
});
