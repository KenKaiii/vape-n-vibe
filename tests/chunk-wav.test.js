import { describe, it, expect } from "vitest";
import { chunkWavOnSilence, analyzeWav } from "../src/main/transcribe";

// ---------------------------------------------------------------------------
// Constants mirrored from transcribe.js (kept in sync manually)
// ---------------------------------------------------------------------------
const WAV_HEADER = 44;
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const BYTES_PER_SEC = SAMPLE_RATE * BYTES_PER_SAMPLE;
const SEGMENT_SAMPLES = Math.floor(SAMPLE_RATE * 0.05); // 800 (50ms)
const SEGMENT_BYTES = SEGMENT_SAMPLES * BYTES_PER_SAMPLE; // 1600
const SEGS_PER_SEC = 20; // 1000ms / 50ms
const MAX_CHUNK_S = 20; // PARAKEET_MAX_CHUNK_S

// ---------------------------------------------------------------------------
// Helpers (same WAV builder as audio.test.js)
// ---------------------------------------------------------------------------

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
  buf.writeUInt32LE(BYTES_PER_SEC, 28);
  buf.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(pcmData.length, 40);
  pcmData.copy(buf, WAV_HEADER);
  return buf;
}

/** PCM buffer of `seconds` seconds where every 50ms segment is `sample`. */
function makePcmSeconds(seconds, sample) {
  const numSegments = Math.round(seconds * SEGS_PER_SEC);
  const buf = Buffer.alloc(numSegments * SEGMENT_BYTES);
  for (let i = 0; i < numSegments * SEGMENT_SAMPLES; i++) {
    buf.writeInt16LE(sample, i * BYTES_PER_SAMPLE);
  }
  return buf;
}

/** Overwrite the 50ms segment at `segIndex` with `sample` in-place. */
function setSegment(pcm, segIndex, sample) {
  for (let i = 0; i < SEGMENT_SAMPLES; i++) {
    pcm.writeInt16LE(sample, segIndex * SEGMENT_BYTES + i * BYTES_PER_SAMPLE);
  }
}

const LOUD = 5000;
const QUIET = 10;

function pcmDuration(wav) {
  return (wav.length - WAV_HEADER) / BYTES_PER_SEC;
}

// ---------------------------------------------------------------------------
// chunkWavOnSilence
// ---------------------------------------------------------------------------

describe("chunkWavOnSilence", () => {
  it("returns the buffer untouched when shorter than the chunk limit", () => {
    const wav = makeWav(makePcmSeconds(10, LOUD));
    const chunks = chunkWavOnSilence(wav);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(wav);
  });

  it("returns the buffer untouched at exactly the chunk limit", () => {
    const wav = makeWav(makePcmSeconds(MAX_CHUNK_S, LOUD));
    expect(chunkWavOnSilence(wav)).toHaveLength(1);
  });

  it("splits audio longer than the limit into chunks of at most 20s", () => {
    const wav = makeWav(makePcmSeconds(65, LOUD));
    const chunks = chunkWavOnSilence(wav);
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    for (const chunk of chunks) {
      expect(pcmDuration(chunk)).toBeLessThanOrEqual(MAX_CHUNK_S);
    }
  });

  it("preserves every PCM byte across chunks, in order", () => {
    // Distinct ramp so re-concatenation can be compared byte-for-byte.
    const pcm = makePcmSeconds(45, LOUD);
    for (let i = 0; i < pcm.length / BYTES_PER_SAMPLE; i++) {
      pcm.writeInt16LE((i % 60000) - 30000, i * BYTES_PER_SAMPLE);
    }
    const wav = makeWav(pcm);
    const chunks = chunkWavOnSilence(wav);
    const rejoined = Buffer.concat(chunks.map((c) => c.subarray(WAV_HEADER)));
    expect(rejoined.equals(pcm)).toBe(true);
  });

  it("splits at the quietest segment in the lookback window", () => {
    // 30s loud with one quiet segment at 15s — the split should land there
    // (within the [12s..20s] lookback window before the 20s limit).
    const pcm = makePcmSeconds(30, LOUD);
    const quietSeg = 15 * SEGS_PER_SEC;
    setSegment(pcm, quietSeg, QUIET);
    const wav = makeWav(pcm);

    const chunks = chunkWavOnSilence(wav);
    expect(chunks).toHaveLength(2);
    expect(pcmDuration(chunks[0])).toBeCloseTo(15, 2);
    expect(pcmDuration(chunks[1])).toBeCloseTo(15, 2);
  });

  it("produces structurally valid WAV chunks (header sizes match)", () => {
    const wav = makeWav(makePcmSeconds(50, LOUD));
    for (const chunk of chunkWavOnSilence(wav)) {
      const dataLen = chunk.length - WAV_HEADER;
      expect(chunk.readUInt32LE(4)).toBe(36 + dataLen);
      expect(chunk.readUInt32LE(40)).toBe(dataLen);
      expect(chunk.toString("ascii", 0, 4)).toBe("RIFF");
      // Chunks must still be analyzable by the existing pipeline helpers.
      expect(analyzeWav(chunk).hasSpeech).toBe(true);
    }
  });

  it("handles a buffer smaller than the WAV header", () => {
    const tiny = Buffer.alloc(20);
    const chunks = chunkWavOnSilence(tiny);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(tiny);
  });
});
