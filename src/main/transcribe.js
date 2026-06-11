const fs = require("node:fs/promises");
const defaults = require("../config/defaults");
const store = require("./store");
const { ensureServer, getServerUrl } = require("./whisper-server");

/** Minimum audio duration in seconds to bother transcribing. */
const MIN_AUDIO_DURATION_S = 0.5;

/**
 * Below this duration, skip the dictionary prompt — on ~1s of audio
 * the 40+ word prompt dominates context and biases the output toward
 * technical jargon (random "Claude"/"Docker"/etc.)
 */
const PROMPT_MIN_AUDIO_S = 1.5;

/**
 * RMS energy threshold — audio below this is considered silent.
 * 16-bit PCM range is -32768..32767; threshold ~0.5% of full scale.
 */
const SILENCE_RMS_THRESHOLD = 150;

/** Segment size used for both silence detection and trimming. */
const SEGMENT_MS = 50;

/**
 * Keep this much silence on each side of detected speech after trimming.
 * Zero-length boundaries are what trigger end-of-audio hallucinations;
 * a short guard band avoids clipping word onsets/offsets.
 */
const TRIM_GUARD_MS = 120;

/**
 * Trim leading and trailing silence from a 16-bit PCM mono WAV buffer.
 * Push-to-talk clips typically contain silence between the hotkey press
 * and the first spoken syllable (and again at the end) — those silent
 * regions are exactly where Whisper fabricates "thanks for watching",
 * "you", and similar end-of-audio hallucinations. Multiple community
 * projects (Superwhisper's "Remove Silence", open-webui's
 * remove_silence preprocess) report large hallucination reductions
 * from this single change.
 *
 * Implementation: scan 50ms RMS segments, find first and last segment
 * above the speech threshold, keep TRIM_GUARD_MS on each side.
 * Falls back to the original buffer if no speech is detected (caller
 * should have already short-circuited via analyzeWav, but be safe).
 */
function trimSilenceWav(wavData) {
  const WAV_HEADER = 44;
  const SAMPLE_RATE = 16000;
  const BYTES_PER_SAMPLE = 2;

  if (wavData.length <= WAV_HEADER) return wavData;

  const pcmBytes = wavData.length - WAV_HEADER;
  const segmentSamples = Math.floor((SAMPLE_RATE * SEGMENT_MS) / 1000);
  const segmentBytes = segmentSamples * BYTES_PER_SAMPLE;
  const pcm = Buffer.from(
    wavData.buffer,
    wavData.byteOffset + WAV_HEADER,
    pcmBytes,
  );

  // Find first and last segment containing speech.
  let firstSpeechSeg = -1;
  let lastSpeechSeg = -1;
  const numSegs = Math.floor(pcmBytes / segmentBytes);
  for (let s = 0; s < numSegs; s++) {
    let sumSq = 0;
    const base = s * segmentBytes;
    for (let i = 0; i < segmentSamples; i++) {
      const sample = pcm.readInt16LE(base + i * BYTES_PER_SAMPLE);
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / segmentSamples);
    if (rms > SILENCE_RMS_THRESHOLD) {
      if (firstSpeechSeg === -1) firstSpeechSeg = s;
      lastSpeechSeg = s;
    }
  }

  if (firstSpeechSeg === -1) return wavData; // all silence, bail

  const guardSegs = Math.ceil(TRIM_GUARD_MS / SEGMENT_MS);
  const startSeg = Math.max(0, firstSpeechSeg - guardSegs);
  const endSeg = Math.min(numSegs - 1, lastSpeechSeg + guardSegs);

  const startByte = startSeg * segmentBytes;
  const endByte = (endSeg + 1) * segmentBytes; // exclusive
  const trimmedLen = endByte - startByte;

  // No meaningful trim? skip the copy.
  if (startByte === 0 && endByte === pcmBytes) return wavData;

  const header = Buffer.from(wavData.buffer, wavData.byteOffset, WAV_HEADER);
  const out = Buffer.alloc(WAV_HEADER + trimmedLen);
  header.copy(out, 0);
  pcm.copy(out, WAV_HEADER, startByte, endByte);

  // Fix RIFF chunk size (offset 4) and data chunk size (offset 40).
  out.writeUInt32LE(36 + trimmedLen, 4);
  out.writeUInt32LE(trimmedLen, 40);

  return out;
}

/**
 * Check if a WAV buffer (16-bit PCM mono) contains enough speech to
 * be worth transcribing.  Returns { hasSpeech, duration } so callers
 * can short-circuit before hitting Whisper.
 */
function analyzeWav(wavData) {
  const WAV_HEADER = 44;
  const BYTES_PER_SAMPLE = 2;
  const SAMPLE_RATE = 16000;

  if (wavData.length <= WAV_HEADER) {
    return { hasSpeech: false, duration: 0 };
  }

  const pcmBytes = wavData.length - WAV_HEADER;
  const numSamples = Math.floor(pcmBytes / BYTES_PER_SAMPLE);
  const duration = numSamples / SAMPLE_RATE;

  // Too short — Whisper hallucinates on sub-second clips
  if (duration < MIN_AUDIO_DURATION_S) {
    return { hasSpeech: false, duration };
  }

  // Segment-based energy check: if ANY 50ms window exceeds threshold,
  // the audio likely contains speech.  This avoids averaging short
  // phrases surrounded by silence (which dilutes the energy).
  const segmentSamples = Math.floor(SAMPLE_RATE * 0.05); // 50ms segments
  const pcm = Buffer.from(wavData.buffer, wavData.byteOffset + WAV_HEADER);

  for (
    let off = 0;
    off + segmentSamples * BYTES_PER_SAMPLE <= pcmBytes;
    off += segmentSamples * BYTES_PER_SAMPLE
  ) {
    let sumSq = 0;
    for (let i = 0; i < segmentSamples; i++) {
      const sample = pcm.readInt16LE(off + i * BYTES_PER_SAMPLE);
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / segmentSamples);
    if (rms > SILENCE_RMS_THRESHOLD) {
      return { hasSpeech: true, duration };
    }
  }

  return { hasSpeech: false, duration };
}

/**
 * Build a multipart/form-data body for the whisper.cpp HTTP server.
 *
 * @param {Buffer} wavData - WAV audio buffer to send.
 * @param {object} options
 * @param {string[]} options.promptWords - Dictionary words to include as
 *   a prompt.  Pass an empty array to omit the prompt field entirely.
 * @returns {{ body: Buffer, contentType: string }}
 */
function buildWhisperForm(wavData, { promptWords = [] } = {}) {
  const boundary = `----whisper${Date.now()}`;
  const parts = [];

  // Audio file part
  parts.push(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n' +
      "Content-Type: audio/wav\r\n\r\n",
  );
  parts.push(wavData);
  parts.push("\r\n");

  // Response format. The legacy whisper-node server reads
  // `response-format`; current whisper.cpp servers read
  // `response_format`. Send both — each server ignores the unknown one.
  for (const fieldName of ["response-format", "response_format"]) {
    parts.push(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${fieldName}"\r\n\r\n` +
        "text\r\n",
    );
  }

  // Disable temperature fallback — the single biggest lever against
  // end-of-audio hallucinations.
  // Legacy server: the `temperature` field is wired to
  //   wparams.temperature_inc, so 0.0 means "never retry at higher
  //   randomness".
  // Modern server: `temperature` is the actual sampling temperature and
  //   `temperature_inc` controls fallback — 0.0 for both gives the same
  //   deterministic, no-fallback behavior.
  for (const fieldName of ["temperature", "temperature_inc"]) {
    parts.push(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${fieldName}"\r\n\r\n` +
        "0.0\r\n",
    );
  }

  // Prompt (dictionary words) — omitted when list is empty
  if (promptWords.length > 0) {
    parts.push(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="prompt"\r\n\r\n' +
        promptWords.join(", ") +
        "\r\n",
    );
  }

  parts.push(`--${boundary}--\r\n`);

  const body = Buffer.concat(
    parts.map((p) => (typeof p === "string" ? Buffer.from(p) : p)),
  );

  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

/**
 * Transcribe a WAV file via the local whisper.cpp HTTP server.
 *
 * @param {string} wavPath - Path to the WAV file on disk.
 * @param {string} lang   - Language hint passed to the server.
 * @param {object} [options]
 * @param {Buffer} [options.rawWav]   - Pre-loaded WAV bytes (skip fs.readFile).
 * @param {{hasSpeech: boolean, duration: number}} [options.analysis]
 *   Result of `analyzeWav(rawWav)`.  When provided alongside `rawWav`,
 *   transcribe() will not re-read or re-analyze the file.  This is the
 *   path used by the pipeline so a recording is read & analyzed exactly
 *   once.
 */
async function transcribe(wavPath, lang, { rawWav, analysis } = {}) {
  // --- Pre-transcription audio validation ---
  // The pipeline analyzes the buffer once and passes the result through;
  // legacy/standalone callers still get the original behaviour.
  if (!rawWav) {
    rawWav = await fs.readFile(wavPath);
  }
  const { hasSpeech, duration: audioDuration } = analysis ?? analyzeWav(rawWav);

  if (!hasSpeech) {
    console.log(
      `[transcribe] Skipped — audio too short (${audioDuration.toFixed(2)}s) or silent`,
    );
    return "";
  }

  // Trim leading/trailing silence — silent regions at clip boundaries
  // are the primary trigger for end-of-audio hallucinations.
  const wavData = trimSilenceWav(rawWav);

  await ensureServer(lang);

  // Build prompt from built-in + user dictionary words.
  // Skip on very short clips where the prompt biases output toward jargon.
  const builtIn = defaults.dictionary.builtIn || [];
  const userWords = store.get("dictionaryWords") || [];
  const promptWords =
    audioDuration < PROMPT_MIN_AUDIO_S
      ? []
      : [...new Set([...builtIn, ...userWords])];

  const { body, contentType } = buildWhisperForm(wavData, { promptWords });

  // Timeout scales with audio length: 5x real-time + 10s base.
  const timeout = Math.max(15000, audioDuration * 5000 + 10000);

  console.log(
    `[transcribe] POST ${getServerUrl()}/inference (${Math.round(audioDuration)}s audio, ${Math.round(timeout / 1000)}s timeout)`,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${getServerUrl()}/inference`, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Server returned ${response.status}: ${errText}`);
    }

    const text = parseOutput(await response.text());
    console.log("[transcribe] result:", text);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// ── Hallucination filtering ────────────────────────────────────────

/**
 * Exact-match hallucinations — if the *entire* transcript is one of
 * these (case-insensitive, after stripping trailing punctuation),
 * reject it outright.  Trailing `.!?` is stripped before lookup so
 * entries here don't need punctuated duplicates.
 */
const HALLUCINATION_EXACT = new Set([
  "thank you",
  "thanks",
  "thank you for watching",
  "thanks for watching",
  "thank you for listening",
  "thanks for listening",
  "subscribe",
  "like and subscribe",
  "please subscribe",
  "don't forget to subscribe",
  "hit the bell",
  "leave a comment",
  "see you next time",
  "see you later",
  "see you in the next video",
  "see you in the next one",
  "bye",
  "bye bye",
  "bye-bye",
  "goodbye",
  "good bye",
  "take care",
  "have a nice day",
  "have a good day",
  "peace out",
  "the end",
  "silence",
  "no speech",
  "inaudible",
  "you",
  "so",
  "okay",
  "yeah",
  "hmm",
  "hm",
  "oh",
  "ah",
  "uh",
  "um",
]);

/**
 * Normalize text for hallucination lookup: lowercase, collapse
 * whitespace, and strip trailing punctuation so "Thank you." and
 * "Thank you!" both match the entry "thank you".
 */
function normalizeForHallucinationCheck(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
}

/** Pattern for bracket/paren tokens and punctuation-only strings. */
const HALLUCINATION_STRUCTURAL_RE = /^\[.*\]$|^[\s.!?…,;:*()#\-_]+$/;

/**
 * Trailing phrases to strip from the *end* of otherwise valid
 * transcriptions (e.g. "deploy the feature. Thank you.").
 * Ordered longest-first so greedy match works correctly.
 * Matching strips trailing `.!?` from the transcript before
 * comparison, so entries here don't need punctuated duplicates.
 */
const TRAILING_HALLUCINATIONS = [
  "thank you for watching",
  "thanks for watching",
  "thank you for listening",
  "thanks for listening",
  "don't forget to subscribe",
  "like and subscribe",
  "please subscribe",
  "see you next time",
  "see you later",
  "thank you",
  "thanks",
  "bye bye",
  "bye-bye",
  "goodbye",
  "good bye",
  "bye",
];

/**
 * Detect repetitive loops — Whisper sometimes gets stuck repeating
 * the same word/phrase.  If any single word accounts for ≥60% of all
 * words (and there are at least 4 words), treat it as a hallucination.
 */
function isRepetitiveLoop(text) {
  const words = text.toLowerCase().split(/\s+/);
  if (words.length < 4) return false;

  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }
  const maxCount = Math.max(...Object.values(freq));
  return maxCount / words.length >= 0.6;
}

/**
 * Strip trailing hallucinated phrases from the end of a transcript.
 * Trailing punctuation (.!?) is removed before comparison so the
 * phrase list doesn't need punctuated duplicates.
 * Returns the cleaned text.
 */
function stripTrailingHallucinations(text) {
  let result = text;
  let changed = true;
  while (changed) {
    changed = false;
    const trimmed = result.trimEnd();
    // Strip trailing punctuation for matching (but measure how many
    // chars to remove from the original string including the punct).
    const noPunct = trimmed.replace(/[.!?]+$/, "");
    const lower = noPunct.toLowerCase();
    for (const phrase of TRAILING_HALLUCINATIONS) {
      if (lower.endsWith(phrase)) {
        result = noPunct.slice(0, noPunct.length - phrase.length).trimEnd();
        changed = true;
        break; // restart from longest phrases
      }
    }
  }
  return result;
}

/**
 * Parse and clean a whisper output blob.
 *
 * @param {string} stdout - Raw whisper output (may include timestamp
 *   prefixes, bracket tokens, multi-line wrapping).
 * @param {object} [options]
 * @param {boolean} [options.exact=true] - When true (full transcription),
 *   reject the entire output if it exactly matches a known hallucination
 *   phrase ("thank you", "okay", "yeah", "so", …).  When false (partial
 *   transcription, used for live preview), skip that exact-match check
 *   so legitimate single-word partial utterances like "okay" or "so"
 *   survive.  Structural filtering, repetitive-loop detection, and
 *   trailing-phrase stripping always run.
 */
function parseOutput(stdout, { exact = true } = {}) {
  let text = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(" ")
    .replace(/^-\s*/, "")
    .replace(/\[.*?\]/g, "") // strip bracket tokens like [BLANK_AUDIO]
    .replace(/\(.*?\)/g, "") // strip paren tokens like (music)
    .trim();

  // 1. Structural patterns (brackets-only, punctuation-only) — always.
  if (!text || HALLUCINATION_STRUCTURAL_RE.test(text)) {
    console.log(
      "[transcribe] Filtered hallucination (structural):",
      JSON.stringify(text),
    );
    return "";
  }

  // 2. Exact-match hallucinations (entire output is a known phrase) —
  //    skipped for partial transcriptions where "okay"/"yeah"/"so" are
  //    plausible real partial utterances.
  if (exact && HALLUCINATION_EXACT.has(normalizeForHallucinationCheck(text))) {
    console.log(
      "[transcribe] Filtered hallucination (exact):",
      JSON.stringify(text),
    );
    return "";
  }

  // 3. Repetitive loop detection — always.
  if (isRepetitiveLoop(text)) {
    console.log(
      "[transcribe] Filtered hallucination (repetitive):",
      JSON.stringify(text),
    );
    return "";
  }

  // 4. Strip trailing hallucinated phrases from real transcriptions.
  const stripped = stripTrailingHallucinations(text);
  if (stripped !== text) {
    console.log(
      "[transcribe] Stripped trailing hallucination:",
      JSON.stringify(text),
      "→",
      JSON.stringify(stripped),
    );
    text = stripped;
  }

  // Final check — stripping may have left nothing, or left only an
  // exact-match hallucination (only relevant when exact filtering on).
  if (!text) return "";
  if (exact && HALLUCINATION_EXACT.has(normalizeForHallucinationCheck(text))) {
    console.log(
      "[transcribe] Filtered hallucination (post-strip):",
      JSON.stringify(text),
    );
    return "";
  }

  return text;
}

/**
 * Controller for the in-flight partial request, if any.  The whisper
 * server processes requests serially, so an in-flight partial blocks
 * the final transcription — cancelActivePartial() lets the pipeline
 * abort it the moment recording stops instead of waiting it out.
 */
let activePartialController = null;

function cancelActivePartial() {
  if (activePartialController) {
    activePartialController.abort();
    activePartialController = null;
  }
}

/**
 * Lightweight partial transcription for live preview during recording.
 * Accepts a raw WAV buffer, POSTs it to the whisper server, and returns
 * text with only structural filtering (no hallucination exact-match
 * since partials are ephemeral display-only).
 */
async function transcribePartial(wavBuffer, lang) {
  const wavData =
    wavBuffer instanceof Uint8Array
      ? wavBuffer
      : new Uint8Array(
          wavBuffer instanceof ArrayBuffer
            ? wavBuffer
            : wavBuffer.buffer.slice(
                wavBuffer.byteOffset,
                wavBuffer.byteOffset + wavBuffer.byteLength,
              ),
        );

  const { hasSpeech } = analyzeWav(wavData);
  if (!hasSpeech) return "";

  await ensureServer(lang);

  // Measure duration for the PROMPT_MIN_AUDIO_S guard (same logic as
  // transcribe()): skip the dictionary prompt on very short clips where
  // it dominates context and biases output toward technical jargon.
  const WAV_HEADER = 44;
  const BYTES_PER_SAMPLE = 2;
  const SAMPLE_RATE = 16000;
  const pcmBytes =
    wavData.length > WAV_HEADER ? wavData.length - WAV_HEADER : 0;
  const partialDuration = Math.floor(pcmBytes / BYTES_PER_SAMPLE) / SAMPLE_RATE;

  const builtIn = defaults.dictionary.builtIn || [];
  const userWords = store.get("dictionaryWords") || [];
  const promptWords =
    partialDuration < PROMPT_MIN_AUDIO_S
      ? []
      : [...new Set([...builtIn, ...userWords])];

  const audioBuffer = Buffer.from(
    wavData.buffer,
    wavData.byteOffset,
    wavData.length,
  );
  const { body, contentType } = buildWhisperForm(audioBuffer, { promptWords });

  const controller = new AbortController();
  activePartialController = controller;
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${getServerUrl()}/inference`, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
      signal: controller.signal,
    });

    if (!response.ok) return "";

    // Partials are ephemeral live-preview text — skip exact-match
    // hallucination filtering so plausible single-word partial
    // utterances ("okay", "yeah", "so") survive.  Structural and
    // repetitive-loop filtering still run.
    const text = parseOutput(await response.text(), { exact: false });
    console.log("[transcribe-partial] result:", text);
    return text;
  } catch (err) {
    if (err.name === "AbortError") return ""; // cancelled — expected
    throw err;
  } finally {
    clearTimeout(timer);
    if (activePartialController === controller) {
      activePartialController = null;
    }
  }
}

module.exports = {
  transcribe,
  transcribePartial,
  cancelActivePartial,
  parseOutput,
  buildWhisperForm,
  trimSilenceWav,
  analyzeWav,
};
