const { spawn } = require("node:child_process");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { app } = require("electron");
const defaults = require("../config/defaults");
const { getWhisperServer, getWhisperCppDir } = require("../config/paths");

/**
 * Resolve a writable directory to use as the whisper.cpp server's cwd.
 *
 * The bundled server (whisper-node) hardcodes its inference temp file as
 * `whisper_server_temp_file.wav` *relative to cwd*. In a packaged macOS
 * build, the natural cwd (node_modules/whisper-node/lib/whisper.cpp under
 * app.asar.unpacked) is read-only — the temp write silently fails and the
 * server then returns `{"error":"failed to read WAV file"}`. Pointing cwd
 * at a per-user writable dir avoids this.
 */
function getServerCwd() {
  const base = app ? app.getPath("temp") : os.tmpdir();
  const dir = path.join(base, "vapenvibe-whisper");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // best effort — fall back to plain tmp
    return base;
  }
  return dir;
}

let serverProcess = null;
let serverPort = null;
let ready = false;
let restartCount = 0;
let restartCountResetTimer = null;
const MAX_RESTARTS = 3;
/** After this many ms without a failure, reset the restart counter */
const RESTART_COUNT_DECAY_MS = 60000;

/**
 * Find a free TCP port by briefly binding to port 0.
 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/**
 * Poll the server's root endpoint until it responds.
 */
function waitForReady(port, timeoutMs) {
  const url = `http://127.0.0.1:${port}`;
  const start = Date.now();

  return new Promise((resolve, reject) => {
    async function poll() {
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(`Whisper server not reachable within ${timeoutMs / 1000}s`),
        );
        return;
      }
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok || res.status === 200) {
          resolve();
          return;
        }
      } catch {
        // not ready yet
      }
      setTimeout(poll, 500);
    }
    poll();
  });
}

/**
 * Start the whisper.cpp HTTP server with the configured model.
 * Resolves when the server responds to HTTP requests.
 */
async function startServer(lang) {
  if (serverProcess) return;

  const modelPath = defaults.model.path;
  if (!modelPath) {
    throw new Error("No whisper model path configured");
  }

  const fs = require("node:fs");
  if (!fs.existsSync(modelPath)) {
    throw new Error(
      `Whisper model not found at ${modelPath} — download it first`,
    );
  }

  const port = await findFreePort();
  const { bin: serverBin, modern } = getWhisperServer();
  const whisperCppDir = getWhisperCppDir();
  const cwd = getServerCwd();

  const language = lang || defaults.model.lang;

  // The server defaults to 4 compute threads. On Metal the encoder runs
  // on GPU, but decode/CPU fallback paths still benefit from more cores.
  // Leave headroom (cores - 2) and cap at 8 — whisper.cpp scales poorly
  // beyond that and saturating every core just adds heat.
  const threads = Math.min(8, Math.max(4, os.availableParallelism() - 2));

  const args = [
    "--model",
    modelPath,
    "--port",
    String(port),
    "--host",
    "127.0.0.1",
    "--language",
    language,
    // Beam search is measurably more stable than greedy on short clips —
    // reduces both single-word mis-hears and end-of-audio hallucinations.
    // (--best-of is intentionally omitted: it only applies to the sampling
    // decoder at temperature>0, and we force temperature=0.0 per request.)
    "--beam-size",
    "5",
    // Disable cross-segment text context. Default behavior feeds the
    // previous segment's tokens as a prompt for the next segment, which
    // chains hallucinations: one stray "thank you" biases the next
    // segment toward more YouTube-outro phrases. Setting to 0 makes
    // each segment decode independently. Confirmed against whisper.cpp
    // wparams.n_max_text_ctx in the server source.
    "--max-context",
    "0",
    "--threads",
    String(threads),
  ];

  // Flags only the modern (vendored, current whisper.cpp) server
  // understands — the legacy whisper-node binary rejects unknown args.
  // Flash attention is on by default in modern builds, no flag needed.
  //
  // Server-side Silero VAD (--vad) is deliberately NOT used: the server
  // keeps one VAD context across requests without resetting it
  // (state->vad_context + whisper_vad_detect_speech_no_reset in
  // whisper.cpp), so VAD time grows ~45ms per request without bound —
  // measured live at 4.3s→4.7s over ten requests in one session. For an
  // always-running app that's a leak, and the VAD pass cost more than
  // its decode savings anyway. Silence handling stays in trimSilenceWav.
  if (modern) {
    // Suppress non-speech tokens (♪, [BLANK_AUDIO], …) at the decoder
    // level instead of regex-stripping them afterwards.
    args.push("--suppress-nst");
  }

  console.log(
    `[whisper-server] Starting (${modern ? "modern" : "legacy"}):`,
    serverBin,
    args.join(" "),
  );

  const proc = spawn(serverBin, args, {
    cwd,
    // Legacy binary: ggml-metal.m loads ggml-metal.metal from
    // GGML_METAL_PATH_RESOURCES when set, otherwise falls back to cwd.
    // Since we deliberately moved cwd away from the whisper.cpp dir
    // (see getServerCwd), point Metal at the bundled shader explicitly.
    // The modern vendored build embeds the shader (GGML_METAL_EMBED_LIBRARY)
    // and ignores this variable.
    env: modern
      ? process.env
      : { ...process.env, GGML_METAL_PATH_RESOURCES: whisperCppDir },
    stdio: ["ignore", "pipe", "pipe"],
    // Don't flash a console window on Windows (no-op elsewhere).
    windowsHide: true,
  });

  // Log server output
  proc.stdout.on("data", (chunk) => {
    process.stderr.write(`[whisper-server] ${chunk.toString()}`);
  });
  proc.stderr.on("data", (chunk) => {
    process.stderr.write(`[whisper-server] ${chunk.toString()}`);
  });

  // Track early exit
  let exited = false;
  proc.on("exit", (code, signal) => {
    console.log(`[whisper-server] Exited (code=${code}, signal=${signal})`);
    exited = true;
    serverProcess = null;
    ready = false;
  });

  proc.on("error", (err) => {
    console.error("[whisper-server] Failed to spawn:", err.message);
    exited = true;
  });

  // Store process immediately so stopServer() can kill it during startup
  serverProcess = proc;
  serverPort = port;

  // Poll until server responds to HTTP
  try {
    await waitForReady(port, 60000);

    if (exited) {
      throw new Error("Server exited during startup");
    }

    ready = true;
    restartCount = 0;
    clearTimeout(restartCountResetTimer);
    restartCountResetTimer = null;
    console.log(`[whisper-server] Ready on port ${port}`);
  } catch (err) {
    // Clean up on failure
    serverProcess = null;
    serverPort = null;
    try {
      proc.kill("SIGKILL");
    } catch {
      // already dead
    }
    throw err;
  }
}

/**
 * Stop the whisper server process.
 */
function stopServer() {
  if (!serverProcess) return;

  console.log("[whisper-server] Stopping server...");
  const proc = serverProcess;
  serverProcess = null;
  ready = false;
  serverPort = null;
  restartCount = 0;

  proc.kill("SIGTERM");

  // Force kill after 3 seconds if still alive
  setTimeout(() => {
    try {
      proc.kill("SIGKILL");
    } catch {
      // already dead
    }
  }, 3000);
}

/**
 * Ensure the server is running. Restarts if it crashed.
 */
async function ensureServer(lang) {
  if (ready && serverProcess && !serverProcess.killed) return;

  if (restartCount >= MAX_RESTARTS) {
    // Schedule a reset so the server can be retried after a cooldown
    if (!restartCountResetTimer) {
      restartCountResetTimer = setTimeout(() => {
        console.log("[whisper-server] Restart counter reset after cooldown");
        restartCount = 0;
        restartCountResetTimer = null;
      }, RESTART_COUNT_DECAY_MS);
    }
    throw new Error(
      `Whisper server failed after ${MAX_RESTARTS} restart attempts — will retry after ${RESTART_COUNT_DECAY_MS / 1000}s`,
    );
  }

  restartCount++;
  console.log(
    `[whisper-server] Restart attempt ${restartCount}/${MAX_RESTARTS}`,
  );

  // Clean up any zombie process
  if (serverProcess) {
    try {
      serverProcess.kill("SIGKILL");
    } catch {
      // already dead
    }
    serverProcess = null;
    ready = false;
  }

  await startServer(lang);
}

/**
 * Restart the server with a new language setting.
 */
async function restartServer(lang) {
  stopServer();
  await startServer(lang);
}

/**
 * Get the base URL for the running server.
 */
function getServerUrl() {
  return `http://127.0.0.1:${serverPort}`;
}

/**
 * Whether the server is ready to accept requests.
 */
function isReady() {
  return ready && serverProcess !== null;
}

module.exports = {
  startServer,
  stopServer,
  ensureServer,
  restartServer,
  getServerUrl,
  isReady,
};
