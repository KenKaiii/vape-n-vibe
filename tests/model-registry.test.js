/**
 * Tests for multi-model engine dispatch:
 *   - getActiveModel fallback rules (unsupported language / missing files
 *     route parakeet selections back to whisper)
 *   - parakeet-specific parseOutput filtering (no whisper hallucination
 *     exact-match or trailing-phrase stripping)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fake store — controls selectedModel and language per test.
const storeState = { selectedModel: undefined, language: "auto" };
const fakeStore = {
  get: vi.fn((key) => storeState[key]),
  set: vi.fn(),
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

// Fake download module — controls modelExists per test.
const downloadState = { exists: true };
const downloadPath = require.resolve(
  path.resolve(__dirname, "../src/main/download.js"),
);
require.cache[downloadPath] = {
  id: downloadPath,
  filename: downloadPath,
  loaded: true,
  exports: {
    modelExists: vi.fn(() => downloadState.exists),
    downloadModels: vi.fn(),
    startEngineForModel: vi.fn(),
  },
};

const transcribePath = require.resolve(
  path.resolve(__dirname, "../src/main/transcribe.js"),
);
delete require.cache[transcribePath];
const { getActiveModel, parseOutput } = require(transcribePath);

const PARAKEET_KEY = "parakeet-tdt-0.6b-v3-int8";
const WHISPER_KEY = "whisper-large-v3-turbo-q5";

describe("getActiveModel", () => {
  beforeEach(() => {
    storeState.selectedModel = undefined;
    storeState.language = "auto";
    downloadState.exists = true;
  });

  it("returns the default whisper model when nothing is selected", () => {
    const { key, model } = getActiveModel();
    expect(key).toBe(WHISPER_KEY);
    expect(model.engine).toBe("whisper");
  });

  it("returns parakeet when selected, downloaded, and language supported", () => {
    storeState.selectedModel = PARAKEET_KEY;
    storeState.language = "en";
    const { key, model } = getActiveModel();
    expect(key).toBe(PARAKEET_KEY);
    expect(model.engine).toBe("parakeet");
  });

  it("keeps parakeet on auto language", () => {
    storeState.selectedModel = PARAKEET_KEY;
    storeState.language = "auto";
    expect(getActiveModel().key).toBe(PARAKEET_KEY);
  });

  it("falls back to whisper for unsupported languages", () => {
    storeState.selectedModel = PARAKEET_KEY;
    storeState.language = "ja";
    const { key, model } = getActiveModel();
    expect(key).toBe(WHISPER_KEY);
    expect(model.engine).toBe("whisper");
  });

  it("honours the explicit lang argument over the stored language", () => {
    storeState.selectedModel = PARAKEET_KEY;
    storeState.language = "en";
    expect(getActiveModel("zh").key).toBe(WHISPER_KEY);
    expect(getActiveModel("fr").key).toBe(PARAKEET_KEY);
  });

  it("falls back to whisper when parakeet files are missing", () => {
    storeState.selectedModel = PARAKEET_KEY;
    storeState.language = "en";
    downloadState.exists = false;
    expect(getActiveModel().key).toBe(WHISPER_KEY);
  });

  it("falls back to the default model for unknown keys", () => {
    storeState.selectedModel = "no-such-model";
    expect(getActiveModel().key).toBe(WHISPER_KEY);
  });
});

describe("parseOutput parakeet engine", () => {
  it("keeps phrases whisper would reject as exact hallucinations", () => {
    expect(parseOutput("Thank you.", { engine: "parakeet" })).toBe(
      "Thank you.",
    );
    expect(parseOutput("Bye bye!", { engine: "parakeet" })).toBe("Bye bye!");
  });

  it("does not strip trailing hallucination phrases", () => {
    expect(
      parseOutput("Deploy the feature. Thanks.", { engine: "parakeet" }),
    ).toBe("Deploy the feature. Thanks.");
  });

  it("still applies structural filtering", () => {
    expect(parseOutput("[BLANK_AUDIO]", { engine: "parakeet" })).toBe("");
    expect(parseOutput("...", { engine: "parakeet" })).toBe("");
  });

  it("still applies repetitive-loop filtering", () => {
    expect(
      parseOutput("word word word word word word", { engine: "parakeet" }),
    ).toBe("");
  });

  it("whisper engine behavior is unchanged", () => {
    expect(parseOutput("Thank you.")).toBe("");
    expect(parseOutput("Deploy the feature. Thanks.")).toBe(
      "Deploy the feature.",
    );
  });
});
