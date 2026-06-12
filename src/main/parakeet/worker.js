/**
 * Parakeet transcription worker — runs inside an Electron utilityProcess.
 *
 * sherpa-onnx's `recognizer.decode()` is synchronous/blocking, so it must
 * never run on the main process.  This worker owns the OfflineRecognizer
 * (~700MB resident) and speaks a small message protocol over parentPort:
 *
 *   → { type: "init", files: {encoder, decoder, joiner, tokens}, numThreads }
 *   ← { type: "ready" } | { type: "init-error", error }
 *   → { type: "transcribe", id, wav: Uint8Array }
 *   ← { type: "result", id, text } | { type: "error", id, error }
 */

const WAV_HEADER = 44;
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;

let recognizer = null;

/**
 * Convert a 16kHz mono PCM16 WAV buffer to Float32 samples in [-1, 1].
 * Same WAV layout assumptions as analyzeWav/trimSilenceWav in transcribe.js.
 */
function wavToFloat32(wavData) {
  const buf = Buffer.isBuffer(wavData) ? wavData : Buffer.from(wavData);
  if (buf.length <= WAV_HEADER) return new Float32Array(0);

  const numSamples = Math.floor((buf.length - WAV_HEADER) / BYTES_PER_SAMPLE);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = buf.readInt16LE(WAV_HEADER + i * BYTES_PER_SAMPLE) / 32768;
  }
  return samples;
}

function handleInit(msg) {
  const sherpa = require("sherpa-onnx-node");
  const start = Date.now();

  recognizer = new sherpa.OfflineRecognizer({
    featConfig: {
      sampleRate: SAMPLE_RATE,
      featureDim: 80,
    },
    modelConfig: {
      transducer: {
        encoder: msg.files.encoder,
        decoder: msg.files.decoder,
        joiner: msg.files.joiner,
      },
      tokens: msg.files.tokens,
      numThreads: msg.numThreads || 2,
      provider: "cpu",
      debug: 0,
      modelType: "nemo_transducer",
    },
  });

  console.log(`[parakeet-worker] Recognizer ready in ${Date.now() - start}ms`);
}

function handleTranscribe(msg) {
  if (!recognizer) {
    throw new Error("Recognizer not initialized");
  }
  const samples = wavToFloat32(msg.wav);
  if (samples.length === 0) return "";

  const stream = recognizer.createStream();
  stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples });
  recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  return (result && result.text) || "";
}

process.parentPort.on("message", (e) => {
  const msg = e.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "init") {
    try {
      handleInit(msg);
      process.parentPort.postMessage({ type: "ready" });
    } catch (err) {
      process.parentPort.postMessage({
        type: "init-error",
        error: err.message,
      });
    }
    return;
  }

  if (msg.type === "transcribe") {
    try {
      const text = handleTranscribe(msg);
      process.parentPort.postMessage({ type: "result", id: msg.id, text });
    } catch (err) {
      process.parentPort.postMessage({
        type: "error",
        id: msg.id,
        error: err.message,
      });
    }
  }
});
