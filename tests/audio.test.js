import { describe, it, expect } from "vitest";
import { trimSilenceWav, analyzeWav } from "../src/main/transcribe";

// ---------------------------------------------------------------------------
// Constants mirrored from transcribe.js (kept in sync manually)
// ---------------------------------------------------------------------------
const WAV_HEADER = 44;
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const BYTES_PER_SEC = SAMPLE_RATE * BYTES_PER_SAMPLE; // 32000
const SEGMENT_SAMPLES = Math.floor(SAMPLE_RATE * 0.05); // 800 (50ms)
const SEGMENT_BYTES = SEGMENT_SAMPLES * BYTES_PER_SAMPLE; // 1600
const GUARD_SEGS = Math.ceil(120 / 50); // 3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal but structurally valid WAV buffer.
 * pcmData is a Buffer of 16-bit LE samples (already raw bytes).
 */
function makeWav(pcmData) {
  const buf = Buffer.alloc(WAV_HEADER + pcmData.length);
  // RIFF header
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + pcmData.length, 4); // chunk size
  buf.write("WAVE", 8, "ascii");
  // fmt sub-chunk
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // sub-chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(BYTES_PER_SEC, 28);
  buf.writeUInt16LE(BYTES_PER_SAMPLE, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  // data sub-chunk
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(pcmData.length, 40);
  pcmData.copy(buf, WAV_HEADER);
  return buf;
}

/**
 * Return a Buffer of `numSegments` 50ms segments all filled with `sample`
 * (Int16LE, repeated for every sample in the segment).
 */
function makePcmSegments(numSegments, sample) {
  const buf = Buffer.alloc(numSegments * SEGMENT_BYTES, 0);
  for (let s = 0; s < numSegments; s++) {
    for (let i = 0; i < SEGMENT_SAMPLES; i++) {
      buf.writeInt16LE(sample, s * SEGMENT_BYTES + i * BYTES_PER_SAMPLE);
    }
  }
  return buf;
}

// A sample value that is clearly above the silence threshold (150)
const LOUD = 5000;
// A sample value that is clearly below the silence threshold
const QUIET = 10;

// ---------------------------------------------------------------------------
// analyzeWav
// ---------------------------------------------------------------------------

describe("analyzeWav", () => {
  it("returns hasSpeech=false and duration=0 for a buffer smaller than the WAV header", () => {
    const tiny = Buffer.alloc(20);
    const result = analyzeWav(tiny);
    expect(result.hasSpeech).toBe(false);
    expect(result.duration).toBe(0);
  });

  it("returns hasSpeech=false for a buffer exactly equal to the WAV header (no PCM)", () => {
    const headerOnly = Buffer.alloc(WAV_HEADER);
    const result = analyzeWav(headerOnly);
    expect(result.hasSpeech).toBe(false);
    expect(result.duration).toBe(0);
  });

  it("returns hasSpeech=false for audio shorter than MIN_AUDIO_DURATION_S (0.5s)", () => {
    // 0.4s of loud audio — below the 0.5s minimum
    const pcm = makePcmSegments(8, LOUD); // 8 × 50ms = 0.4s
    const wav = makeWav(pcm);
    const result = analyzeWav(wav);
    expect(result.hasSpeech).toBe(false);
    expect(result.duration).toBeCloseTo(0.4, 2);
  });

  it("returns hasSpeech=false for a long but fully silent buffer", () => {
    // 1s of silence (sample value = QUIET, well below threshold)
    const pcm = makePcmSegments(20, QUIET); // 20 × 50ms = 1s
    const wav = makeWav(pcm);
    const result = analyzeWav(wav);
    expect(result.hasSpeech).toBe(false);
    expect(result.duration).toBeCloseTo(1.0, 2);
  });

  it("returns hasSpeech=true when at least one 50ms segment exceeds the threshold", () => {
    // 1s of silence with one loud segment in the middle
    const numSegs = 20;
    const pcm = makePcmSegments(numSegs, QUIET);
    // Overwrite segment 10 with loud samples
    for (let i = 0; i < SEGMENT_SAMPLES; i++) {
      pcm.writeInt16LE(LOUD, 10 * SEGMENT_BYTES + i * BYTES_PER_SAMPLE);
    }
    const wav = makeWav(pcm);
    const result = analyzeWav(wav);
    expect(result.hasSpeech).toBe(true);
    expect(result.duration).toBeCloseTo(1.0, 2);
  });

  it("returns hasSpeech=true when the entire buffer is loud speech", () => {
    const pcm = makePcmSegments(20, LOUD); // 1s
    const wav = makeWav(pcm);
    const result = analyzeWav(wav);
    expect(result.hasSpeech).toBe(true);
  });

  it("duration reflects the actual PCM length", () => {
    // 2s of audio
    const pcm = makePcmSegments(40, QUIET);
    const wav = makeWav(pcm);
    const result = analyzeWav(wav);
    expect(result.duration).toBeCloseTo(2.0, 2);
  });
});

// ---------------------------------------------------------------------------
// trimSilenceWav
// ---------------------------------------------------------------------------

describe("trimSilenceWav", () => {
  it("returns the original buffer unchanged when it is smaller than the WAV header", () => {
    const tiny = Buffer.alloc(20);
    const result = trimSilenceWav(tiny);
    expect(result).toBe(tiny); // same reference
  });

  it("returns the original buffer unchanged when all PCM is silent (no speech detected)", () => {
    // All silent — trimSilenceWav should bail and return the original
    const pcm = makePcmSegments(20, QUIET);
    const wav = makeWav(pcm);
    const result = trimSilenceWav(wav);
    expect(result).toBe(wav);
  });

  it("returns the original buffer unchanged when no trim is needed (speech fills entire clip)", () => {
    // 20 loud segments — start=0 and end=last, so nothing to trim
    const pcm = makePcmSegments(20, LOUD);
    const wav = makeWav(pcm);
    const result = trimSilenceWav(wav);
    // Either the same reference or an identical copy — the PCM content must be the same
    expect(result.length).toBe(wav.length);
    expect(result.slice(WAV_HEADER)).toEqual(wav.slice(WAV_HEADER));
  });

  it("removes leading silence, keeping the guard band", () => {
    // 10 silent segments, then 10 loud segments
    // Speech starts at segment 10. guardSegs=3, so trimmed start = max(0, 10-3) = 7.
    const numSegs = 20;
    const pcm = makePcmSegments(numSegs, QUIET);
    for (let s = 10; s < numSegs; s++) {
      for (let i = 0; i < SEGMENT_SAMPLES; i++) {
        pcm.writeInt16LE(LOUD, s * SEGMENT_BYTES + i * BYTES_PER_SAMPLE);
      }
    }
    const wav = makeWav(pcm);
    const result = trimSilenceWav(wav);

    const expectedStartSeg = 10 - GUARD_SEGS; // = 7
    const expectedEndSeg = numSegs - 1; // last speech seg = 19, guard would exceed, clamped
    const expectedPcmBytes =
      (expectedEndSeg - expectedStartSeg + 1) * SEGMENT_BYTES;

    expect(result.length).toBe(WAV_HEADER + expectedPcmBytes);
  });

  it("removes trailing silence, keeping the guard band", () => {
    // 10 loud segments then 10 silent segments
    // Last speech seg = 9. guardSegs=3, endSeg = min(19, 9+3) = 12.
    // First speech seg = 0. guardSegs=3, startSeg = max(0, 0-3) = 0.
    const numSegs = 20;
    const pcm = makePcmSegments(numSegs, QUIET);
    for (let s = 0; s < 10; s++) {
      for (let i = 0; i < SEGMENT_SAMPLES; i++) {
        pcm.writeInt16LE(LOUD, s * SEGMENT_BYTES + i * BYTES_PER_SAMPLE);
      }
    }
    const wav = makeWav(pcm);
    const result = trimSilenceWav(wav);

    const expectedStartSeg = 0;
    const expectedEndSeg = 9 + GUARD_SEGS; // = 12
    const expectedPcmBytes =
      (expectedEndSeg - expectedStartSeg + 1) * SEGMENT_BYTES;

    expect(result.length).toBe(WAV_HEADER + expectedPcmBytes);
  });

  it("clamps guard band to buffer boundaries — speech at segment 0 does not produce negative start", () => {
    // Speech only in segment 0; silent elsewhere.
    // firstSpeechSeg=0, startSeg = max(0, 0-3) must be 0 (clamped).
    const numSegs = 10;
    const pcm = makePcmSegments(numSegs, QUIET);
    for (let i = 0; i < SEGMENT_SAMPLES; i++) {
      pcm.writeInt16LE(LOUD, 0 * SEGMENT_BYTES + i * BYTES_PER_SAMPLE);
    }
    const wav = makeWav(pcm);
    const result = trimSilenceWav(wav);

    // startSeg clamped to 0, endSeg = min(9, 0+3) = 3
    const expectedEndSeg = Math.min(numSegs - 1, 0 + GUARD_SEGS);
    const expectedPcmBytes = (expectedEndSeg + 1) * SEGMENT_BYTES;

    expect(result.length).toBe(WAV_HEADER + expectedPcmBytes);
  });

  it("clamps guard band to buffer boundaries — speech at last segment does not exceed buffer", () => {
    // Speech only in the last segment; silent elsewhere.
    const numSegs = 10;
    const lastSeg = numSegs - 1;
    const pcm = makePcmSegments(numSegs, QUIET);
    for (let i = 0; i < SEGMENT_SAMPLES; i++) {
      pcm.writeInt16LE(LOUD, lastSeg * SEGMENT_BYTES + i * BYTES_PER_SAMPLE);
    }
    const wav = makeWav(pcm);
    const result = trimSilenceWav(wav);

    // startSeg = max(0, lastSeg - 3) = max(0, 6) = 6
    // endSeg = min(9, lastSeg + 3) = min(9, 12) = 9  (clamped)
    const expectedStartSeg = Math.max(0, lastSeg - GUARD_SEGS);
    const expectedEndSeg = Math.min(numSegs - 1, lastSeg + GUARD_SEGS);
    const expectedPcmBytes =
      (expectedEndSeg - expectedStartSeg + 1) * SEGMENT_BYTES;

    expect(result.length).toBe(WAV_HEADER + expectedPcmBytes);
    // endSeg must not exceed last valid index
    expect(result.length).toBeLessThanOrEqual(wav.length);
  });

  it("patches RIFF chunk size correctly after trimming", () => {
    // 5 silent segs, 5 loud segs, 5 silent segs → trim should cut leading/trailing silence
    const numSegs = 15;
    const pcm = makePcmSegments(numSegs, QUIET);
    for (let s = 5; s < 10; s++) {
      for (let i = 0; i < SEGMENT_SAMPLES; i++) {
        pcm.writeInt16LE(LOUD, s * SEGMENT_BYTES + i * BYTES_PER_SAMPLE);
      }
    }
    const wav = makeWav(pcm);
    const result = trimSilenceWav(wav);

    const trimmedPcmBytes = result.length - WAV_HEADER;
    // RIFF chunk size is at offset 4 and should equal 36 + data size
    const riffChunkSize = result.readUInt32LE(4);
    expect(riffChunkSize).toBe(36 + trimmedPcmBytes);
  });

  it("patches data sub-chunk size correctly after trimming", () => {
    const numSegs = 15;
    const pcm = makePcmSegments(numSegs, QUIET);
    for (let s = 5; s < 10; s++) {
      for (let i = 0; i < SEGMENT_SAMPLES; i++) {
        pcm.writeInt16LE(LOUD, s * SEGMENT_BYTES + i * BYTES_PER_SAMPLE);
      }
    }
    const wav = makeWav(pcm);
    const result = trimSilenceWav(wav);

    const trimmedPcmBytes = result.length - WAV_HEADER;
    // data sub-chunk size is at offset 40
    const dataChunkSize = result.readUInt32LE(40);
    expect(dataChunkSize).toBe(trimmedPcmBytes);
  });

  it("preserves the original WAV header bytes (first 44 bytes) except sizes", () => {
    const numSegs = 15;
    const pcm = makePcmSegments(numSegs, QUIET);
    for (let s = 5; s < 10; s++) {
      for (let i = 0; i < SEGMENT_SAMPLES; i++) {
        pcm.writeInt16LE(LOUD, s * SEGMENT_BYTES + i * BYTES_PER_SAMPLE);
      }
    }
    const wav = makeWav(pcm);
    const result = trimSilenceWav(wav);

    // Bytes 8–3 ("WAVE"), 12–15 ("fmt "), 20–21 (PCM=1), 22–23 (mono=1)
    // should be identical to the original header.
    expect(result.slice(8, 12).toString("ascii")).toBe("WAVE");
    expect(result.slice(12, 16).toString("ascii")).toBe("fmt ");
    expect(result.readUInt16LE(20)).toBe(1); // PCM
    expect(result.readUInt16LE(22)).toBe(1); // mono
    expect(result.slice(36, 40).toString("ascii")).toBe("data");
  });

  it("trimmed PCM content starts from the expected segment offset", () => {
    // 6 silent segs, then 1 loud seg, then 6 silent segs
    // firstSpeechSeg=6, lastSpeechSeg=6
    // startSeg = max(0, 6-3) = 3, endSeg = min(12, 6+3) = 9
    const numSegs = 13;
    const loudSeg = 6;
    const pcm = makePcmSegments(numSegs, QUIET);
    for (let i = 0; i < SEGMENT_SAMPLES; i++) {
      pcm.writeInt16LE(LOUD, loudSeg * SEGMENT_BYTES + i * BYTES_PER_SAMPLE);
    }
    const wav = makeWav(pcm);
    const result = trimSilenceWav(wav);

    const expectedStartSeg = Math.max(0, loudSeg - GUARD_SEGS); // 3
    const expectedEndSeg = Math.min(numSegs - 1, loudSeg + GUARD_SEGS); // 9

    // The first sample in the trimmed buffer's PCM region should equal the
    // first sample from the original at expectedStartSeg.
    const originalFirstSample = pcm.readInt16LE(
      expectedStartSeg * SEGMENT_BYTES,
    );
    const trimmedFirstSample = result.readInt16LE(WAV_HEADER);
    expect(trimmedFirstSample).toBe(originalFirstSample);

    // Verify total trimmed length
    const expectedPcmBytes =
      (expectedEndSeg - expectedStartSeg + 1) * SEGMENT_BYTES;
    expect(result.length).toBe(WAV_HEADER + expectedPcmBytes);
  });
});
