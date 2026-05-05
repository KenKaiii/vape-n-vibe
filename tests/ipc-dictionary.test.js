/**
 * Tests for the set-dictionary IPC handler caps in src/main/ipc.js.
 *
 * ipc.js is CommonJS and calls require("electron") at load time, so we
 * inject a fake electron into the require cache before loading it, then
 * capture the "set-dictionary" handler directly.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Captured handler registry — ipcMain.handle stores handlers here.
// ---------------------------------------------------------------------------
const handlers = {};
const storedWords = { value: null };

// Fake store
const fakeStore = {
  get: vi.fn(() => []),
  set: vi.fn((key, val) => {
    if (key === "dictionaryWords") storedWords.value = val;
  }),
};

// Inject fake electron
const electronPath = require.resolve("electron");
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    clipboard: { readText: () => "", writeText: () => {} },
    app: {
      isPackaged: false,
      getAppPath: () => "/app",
      getPath: () => "/tmp",
      getVersion: () => "1.0.0",
      relaunch: vi.fn(),
      exit: vi.fn(),
    },
    ipcMain: {
      handle: vi.fn((channel, fn) => {
        handlers[channel] = fn;
      }),
      on: vi.fn(),
    },
    BrowserWindow: {
      getAllWindows: () => [],
      fromWebContents: () => null,
    },
    systemPreferences: {
      isTrustedAccessibilityClient: () => true,
      getMediaAccessStatus: () => "granted",
      askForMediaAccess: vi.fn(() => Promise.resolve(true)),
    },
    shell: { openExternal: vi.fn() },
    globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() },
  },
};

// Inject fake store
const storePath = require.resolve(
  path.resolve(__dirname, "../src/main/store.js"),
);
require.cache[storePath] = {
  id: storePath,
  filename: storePath,
  loaded: true,
  exports: fakeStore,
};

// Stub out heavy deps so ipc.js doesn't crash on load
for (const dep of [
  "../src/main/download.js",
  "../src/main/hotkey.js",
  "../src/main/pipeline.js",
  "../src/main/whisper-server.js",
  "../src/main/transcribe.js",
]) {
  const p = require.resolve(path.resolve(__dirname, dep));
  require.cache[p] = {
    id: p,
    filename: p,
    loaded: true,
    exports: {
      downloadModels: vi.fn(),
      updateHotkey: vi.fn(),
      checkAccessibility: vi.fn(() => false),
      requestAccessibility: vi.fn(),
      runPipeline: vi.fn(),
      restartServer: vi.fn(),
      isReady: vi.fn(() => false),
      transcribePartial: vi.fn(),
    },
  };
}

// Load ipc.js fresh so our injected modules are picked up.
const ipcPath = require.resolve(path.resolve(__dirname, "../src/main/ipc.js"));
delete require.cache[ipcPath];
const { registerIpcHandlers } = require(ipcPath);

// Register handlers — uses the fake ipcMain from the injected electron.
registerIpcHandlers({ main: null, overlay: null });

// A senderFrame that passes validateSender.
const validEvent = {
  senderFrame: { url: "file:///app/src/renderer/index.html" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("set-dictionary caps", () => {
  it("stores at most 200 words when 10 000 are passed", () => {
    const tenK = Array.from({ length: 10_000 }, (_, i) => `word${i}`);
    handlers["set-dictionary"](validEvent, tenK);
    expect(storedWords.value.length).toBeLessThanOrEqual(200);
  });

  it("stores exactly 200 words when 10 000 are passed", () => {
    const tenK = Array.from({ length: 10_000 }, (_, i) => `word${i}`);
    handlers["set-dictionary"](validEvent, tenK);
    expect(storedWords.value.length).toBe(200);
  });

  it("rejects words longer than 50 characters", () => {
    const longWord = "a".repeat(100);
    handlers["set-dictionary"](validEvent, [longWord, "ok"]);
    expect(storedWords.value).not.toContain(longWord);
    expect(storedWords.value).toContain("ok");
  });

  it("accepts words exactly 50 characters long", () => {
    const exactly50 = "b".repeat(50);
    handlers["set-dictionary"](validEvent, [exactly50]);
    expect(storedWords.value).toContain(exactly50);
  });

  it("rejects words with whitespace or commas", () => {
    handlers["set-dictionary"](validEvent, ["bad word", "bad,word", "fine"]);
    expect(storedWords.value).toEqual(["fine"]);
  });
});
