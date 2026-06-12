/**
 * Tests for the set-model IPC handler in src/main/ipc.js: key validation
 * against the registry, store persistence, and engine stop/start on switch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const handlers = {};
const storeState = { selectedModel: "whisper-large-v3-turbo-q5" };

const fakeStore = {
  get: vi.fn((key) => storeState[key]),
  set: vi.fn((key, val) => {
    storeState[key] = val;
  }),
};

const electronPath = require.resolve("electron");
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: {
      isPackaged: false,
      getAppPath: () => "/app",
      getPath: () => "/tmp",
      getVersion: () => "1.0.0",
    },
    ipcMain: {
      handle: vi.fn((channel, fn) => {
        handlers[channel] = fn;
      }),
      on: vi.fn(),
    },
    BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
    systemPreferences: {
      isTrustedAccessibilityClient: () => true,
      getMediaAccessStatus: () => "granted",
    },
  },
};

const storePath = require.resolve(
  path.resolve(__dirname, "../src/main/store.js"),
);
require.cache[storePath] = {
  id: storePath,
  filename: storePath,
  loaded: true,
  exports: fakeStore,
};

const stopServer = vi.fn();
const stopParakeet = vi.fn();
const startEngineForModel = vi.fn();
const modelExists = vi.fn(() => true);

const stubs = {
  "../src/main/download.js": {
    downloadModels: vi.fn(),
    modelExists,
    startEngineForModel,
  },
  "../src/main/hotkey.js": {
    updateHotkey: vi.fn(),
    checkAccessibility: vi.fn(() => false),
    requestAccessibility: vi.fn(),
  },
  "../src/main/pipeline.js": { runPipeline: vi.fn() },
  "../src/main/whisper-server.js": {
    restartServer: vi.fn(),
    isReady: vi.fn(() => false),
    stopServer,
  },
  "../src/main/parakeet/index.js": {
    ensureParakeet: vi.fn(),
    stopParakeet,
    isReady: vi.fn(() => false),
    transcribeWav: vi.fn(),
  },
  "../src/main/transcribe.js": {
    transcribePartial: vi.fn(),
    cancelActivePartial: vi.fn(),
  },
};

for (const [dep, exports] of Object.entries(stubs)) {
  const p = require.resolve(path.resolve(__dirname, dep));
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}

const ipcPath = require.resolve(path.resolve(__dirname, "../src/main/ipc.js"));
delete require.cache[ipcPath];
const { registerIpcHandlers } = require(ipcPath);
registerIpcHandlers({ main: null, overlay: null });

const validEvent = {
  senderFrame: { url: "file:///app/src/renderer/index.html" },
};

const PARAKEET_KEY = "parakeet-tdt-0.6b-v3-int8";
const WHISPER_KEY = "whisper-large-v3-turbo-q5";

describe("set-model", () => {
  beforeEach(() => {
    storeState.selectedModel = WHISPER_KEY;
    vi.clearAllMocks();
    modelExists.mockReturnValue(true);
  });

  it("rejects keys not in the registry", () => {
    expect(handlers["set-model"](validEvent, "evil-model")).toBe(false);
    expect(handlers["set-model"](validEvent, 42)).toBe(false);
    expect(handlers["set-model"](validEvent, null)).toBe(false);
    expect(fakeStore.set).not.toHaveBeenCalled();
  });

  it("rejects calls from invalid senders", () => {
    const badEvent = { senderFrame: { url: "https://example.com" } };
    expect(handlers["set-model"](badEvent, PARAKEET_KEY)).toBe(false);
  });

  it("persists a valid model switch and reports downloaded state", () => {
    const res = handlers["set-model"](validEvent, PARAKEET_KEY);
    expect(res).toEqual({ ok: true, downloaded: true });
    expect(fakeStore.set).toHaveBeenCalledWith("selectedModel", PARAKEET_KEY);
  });

  it("stops the whisper server and starts parakeet when switching", () => {
    handlers["set-model"](validEvent, PARAKEET_KEY);
    expect(stopServer).toHaveBeenCalled();
    expect(stopParakeet).not.toHaveBeenCalled();
    expect(startEngineForModel).toHaveBeenCalledWith(PARAKEET_KEY);
  });

  it("stops parakeet when switching back to whisper", () => {
    storeState.selectedModel = PARAKEET_KEY;
    handlers["set-model"](validEvent, WHISPER_KEY);
    expect(stopParakeet).toHaveBeenCalled();
    expect(stopServer).not.toHaveBeenCalled();
  });

  it("does not start an engine when files are missing", () => {
    modelExists.mockReturnValue(false);
    const res = handlers["set-model"](validEvent, PARAKEET_KEY);
    expect(res).toEqual({ ok: true, downloaded: false });
    expect(startEngineForModel).not.toHaveBeenCalled();
  });

  it("is a no-op when re-selecting the current model", () => {
    const res = handlers["set-model"](validEvent, WHISPER_KEY);
    expect(res).toEqual({ ok: true, downloaded: true });
    expect(fakeStore.set).not.toHaveBeenCalled();
    expect(stopServer).not.toHaveBeenCalled();
    expect(stopParakeet).not.toHaveBeenCalled();
  });
});
