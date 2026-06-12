/**
 * Tests for multi-file model downloads in src/main/download.js:
 *   - modelExists requires every file of a model
 *   - downloadModels aggregates progress across files and verifies hashes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fake store — whisper stays selected so downloadModels never tries to
// start an engine for the model under test.
const storePath = require.resolve(
  path.resolve(__dirname, "../src/main/store.js"),
);
require.cache[storePath] = {
  id: storePath,
  filename: storePath,
  loaded: true,
  exports: { get: vi.fn(() => "whisper-large-v3-turbo-q5"), set: vi.fn() },
};

const defaults = require("../src/config/defaults.js");
const downloadPath = require.resolve(
  path.resolve(__dirname, "../src/main/download.js"),
);
delete require.cache[downloadPath];
const { downloadModels, modelExists } = require(downloadPath);

const PARAKEET_KEY = "parakeet-tdt-0.6b-v3-int8";

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Build a mock fetch serving fixed payloads per URL (HEAD + GET). */
function mockFetch(payloads) {
  return vi.fn(async (url, opts = {}) => {
    const body = payloads[url];
    if (!body) return { ok: false, status: 404, headers: new Map() };
    const headers = {
      get: (h) => (h === "content-length" ? String(body.length) : null),
    };
    if (opts.method === "HEAD") {
      return { ok: true, status: 200, headers };
    }
    return {
      ok: true,
      status: 200,
      headers,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(body));
          controller.close();
        },
      }),
    };
  });
}

describe("multi-file model downloads", () => {
  let tmpDir;
  let savedPaths;
  let model;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vnv-download-test-"));
    model = defaults.models[PARAKEET_KEY];
    savedPaths = model.files.map((f) => f.path);
    for (const f of model.files) {
      f.path = path.join(tmpDir, PARAKEET_KEY, f.file);
    }
  });

  afterEach(() => {
    model.files.forEach((f, i) => {
      f.path = savedPaths[i];
    });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("modelExists is false when only some files are present", () => {
    expect(modelExists(PARAKEET_KEY)).toBe(false);
    fs.mkdirSync(path.dirname(model.files[0].path), { recursive: true });
    fs.writeFileSync(model.files[0].path, "x");
    expect(modelExists(PARAKEET_KEY)).toBe(false);
  });

  it("downloads every file with aggregate monotonic progress", async () => {
    const payloads = {};
    const hashes = [];
    for (const f of model.files) {
      const body = Buffer.from(`payload for ${f.file}`.repeat(100));
      payloads[f.url] = body;
      hashes.push(f.sha256);
      f.sha256 = sha256(body);
    }
    vi.stubGlobal("fetch", mockFetch(payloads));

    const events = [];
    const win = {
      webContents: { send: (ch, data) => events.push({ ch, data }) },
    };

    await downloadModels(win, PARAKEET_KEY);

    // restore real hashes
    model.files.forEach((f, i) => {
      f.sha256 = hashes[i];
    });

    expect(events.some((e) => e.ch === "downloads-error")).toBe(false);
    expect(events.at(-1).ch).toBe("downloads-complete");

    const progress = events
      .filter((e) => e.ch === "downloads-progress")
      .map((e) => e.data);
    expect(progress.at(-1)).toBe(100);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }

    expect(modelExists(PARAKEET_KEY)).toBe(true);
  });

  it("reports downloads-error on hash mismatch and leaves no partial file", async () => {
    const payloads = {};
    for (const f of model.files) {
      payloads[f.url] = Buffer.from("corrupted body");
    }
    vi.stubGlobal("fetch", mockFetch(payloads));

    const events = [];
    const win = {
      webContents: { send: (ch, data) => events.push({ ch, data }) },
    };

    await downloadModels(win, PARAKEET_KEY);

    expect(events.some((e) => e.ch === "downloads-error")).toBe(true);
    expect(modelExists(PARAKEET_KEY)).toBe(false);
    expect(fs.existsSync(model.files[0].path + ".tmp")).toBe(false);
  });

  it("short-circuits with downloads-complete when all files exist", async () => {
    for (const f of model.files) {
      fs.mkdirSync(path.dirname(f.path), { recursive: true });
      fs.writeFileSync(f.path, "present");
    }
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const events = [];
    const win = {
      webContents: { send: (ch, data) => events.push({ ch, data }) },
    };
    await downloadModels(win, PARAKEET_KEY);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(events).toEqual([{ ch: "downloads-complete", data: undefined }]);
  });
});
