/**
 * Parakeet engine facade — main-process API around the utilityProcess
 * worker that hosts the sherpa-onnx OfflineRecognizer.  Mirrors the
 * whisper-server module shape: ensure/stop/isReady + transcribeWav.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { utilityProcess } = require("electron");
const defaults = require("../../config/defaults");

let worker = null;
let ready = false;
let nextRequestId = 1;
/** @type {Map<number, {resolve: Function, reject: Function, timer: any}>} */
const pending = new Map();

let restartCount = 0;
let restartCountResetTimer = null;
const MAX_RESTARTS = 3;
/** After this many ms without a failure, reset the restart counter */
const RESTART_COUNT_DECAY_MS = 60000;
/** Model load budget — the 650MB int8 encoder takes a while to mmap/init. */
const INIT_TIMEOUT_MS = 60000;

const WAV_HEADER = 44;
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;

/** Resolve the registry's parakeet model files as {encoder, ..., path}. */
function getParakeetFiles() {
  const entry = defaults.getModelByEngine("parakeet");
  if (!entry) {
    throw new Error("No parakeet model in the registry");
  }
  const byName = {};
  for (const f of entry.model.files) {
    byName[f.file] = f.path;
  }
  const files = {
    encoder: byName["encoder.int8.onnx"],
    decoder: byName["decoder.int8.onnx"],
    joiner: byName["joiner.int8.onnx"],
    tokens: byName["tokens.txt"],
  };
  for (const [name, p] of Object.entries(files)) {
    if (!p) {
      throw new Error(`Parakeet model registry is missing the ${name} file`);
    }
    if (!fs.existsSync(p)) {
      throw new Error(`Parakeet ${name} not found at ${p} — download first`);
    }
  }
  return files;
}

function rejectAllPending(reason) {
  for (const [, req] of pending) {
    clearTimeout(req.timer);
    req.reject(new Error(reason));
  }
  pending.clear();
}

/**
 * Spawn the worker and wait for the recognizer to initialize.
 */
function startWorker() {
  const files = getParakeetFiles();

  // Leave headroom like the whisper server does; ONNX Runtime scales
  // poorly past a handful of intra-op threads on this workload.
  const threads = Math.min(4, Math.max(2, os.availableParallelism() - 2));

  const proc = utilityProcess.fork(path.join(__dirname, "worker.js"), [], {
    serviceName: "parakeet-worker",
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout?.on("data", (chunk) => {
    process.stderr.write(`[parakeet] ${chunk.toString()}`);
  });
  proc.stderr?.on("data", (chunk) => {
    process.stderr.write(`[parakeet] ${chunk.toString()}`);
  });

  return new Promise((resolve, reject) => {
    let settled = false;

    const initTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        proc.kill();
      } catch {
        // already dead
      }
      reject(
        new Error(`Parakeet worker not ready within ${INIT_TIMEOUT_MS}ms`),
      );
    }, INIT_TIMEOUT_MS);

    proc.on("message", (msg) => {
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "ready") {
        if (settled) return;
        settled = true;
        clearTimeout(initTimer);
        ready = true;
        restartCount = 0;
        clearTimeout(restartCountResetTimer);
        restartCountResetTimer = null;
        console.log("[parakeet] Worker ready");
        resolve();
        return;
      }

      if (msg.type === "init-error") {
        if (settled) return;
        settled = true;
        clearTimeout(initTimer);
        try {
          proc.kill();
        } catch {
          // already dead
        }
        reject(new Error(`Parakeet init failed: ${msg.error}`));
        return;
      }

      if (msg.type === "result" || msg.type === "error") {
        const req = pending.get(msg.id);
        if (!req) return; // stale (timed out or session cancelled)
        pending.delete(msg.id);
        clearTimeout(req.timer);
        if (msg.type === "result") {
          req.resolve(msg.text);
        } else {
          req.reject(new Error(msg.error));
        }
      }
    });

    proc.on("exit", (code) => {
      console.log(`[parakeet] Worker exited (code=${code})`);
      if (worker === proc) {
        worker = null;
        ready = false;
      }
      rejectAllPending("Parakeet worker exited");
      if (!settled) {
        settled = true;
        clearTimeout(initTimer);
        reject(new Error("Parakeet worker exited during startup"));
      }
    });

    worker = proc;
    proc.postMessage({ type: "init", files, numThreads: threads });
  });
}

/**
 * Ensure the worker is running and initialized.  Restarts on crash with
 * the same bounded-retry + cooldown pattern as the whisper server.
 */
async function ensureParakeet() {
  if (ready && worker) return;

  if (restartCount >= MAX_RESTARTS) {
    if (!restartCountResetTimer) {
      restartCountResetTimer = setTimeout(() => {
        console.log("[parakeet] Restart counter reset after cooldown");
        restartCount = 0;
        restartCountResetTimer = null;
      }, RESTART_COUNT_DECAY_MS);
    }
    throw new Error(
      `Parakeet worker failed after ${MAX_RESTARTS} restart attempts — will retry after ${RESTART_COUNT_DECAY_MS / 1000}s`,
    );
  }

  restartCount++;
  console.log(`[parakeet] Start attempt ${restartCount}/${MAX_RESTARTS}`);

  // Clean up any zombie process
  if (worker) {
    try {
      worker.kill();
    } catch {
      // already dead
    }
    worker = null;
    ready = false;
  }

  await startWorker();
}

/**
 * Stop the worker process — frees the recognizer's ~700MB immediately.
 */
function stopParakeet() {
  if (!worker) return;

  console.log("[parakeet] Stopping worker...");
  const proc = worker;
  worker = null;
  ready = false;
  restartCount = 0;
  rejectAllPending("Parakeet worker stopped");

  try {
    proc.kill();
  } catch {
    // already dead
  }
}

/** Whether the worker is ready to transcribe. */
function isReady() {
  return ready && worker !== null;
}

/**
 * Transcribe a 16kHz mono PCM16 WAV buffer.
 * @param {Buffer|Uint8Array} wavData
 * @returns {Promise<string>} raw transcript text
 */
async function transcribeWav(wavData) {
  await ensureParakeet();

  const duration =
    Math.floor(Math.max(0, wavData.length - WAV_HEADER) / BYTES_PER_SAMPLE) /
    SAMPLE_RATE;
  // Same formula as the whisper path: 5x real-time + 10s base.
  const timeoutMs = Math.max(15000, duration * 5000 + 10000);

  const id = nextRequestId++;
  const proc = worker;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(
        new Error(`Parakeet transcription timed out after ${timeoutMs}ms`),
      );
    }, timeoutMs);

    pending.set(id, { resolve, reject, timer });
    proc.postMessage({
      type: "transcribe",
      id,
      wav: Buffer.isBuffer(wavData) ? wavData : Buffer.from(wavData),
    });
  });
}

module.exports = { ensureParakeet, stopParakeet, isReady, transcribeWav };
