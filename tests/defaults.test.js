import { describe, it, expect } from "vitest";
import defaults from "../src/config/defaults";

describe("defaults", () => {
  it("has a model registry with required fields", () => {
    expect(Object.keys(defaults.models).length).toBeGreaterThan(0);
    for (const [key, model] of Object.entries(defaults.models)) {
      expect(key).toBeTruthy();
      expect(model.engine).toMatch(/^(whisper|parakeet)$/);
      expect(model.label).toBeDefined();
      expect(model.files.length).toBeGreaterThan(0);
      for (const f of model.files) {
        expect(f.file).toBeDefined();
        expect(f.url).toMatch(/^https:\/\//);
      }
    }
  });

  it("has a default model present in the registry", () => {
    expect(defaults.models[defaults.defaultModel]).toBeDefined();
  });

  it("getModel falls back to the default model on unknown keys", () => {
    expect(defaults.getModel("nope")).toBe(
      defaults.models[defaults.defaultModel],
    );
  });

  it("getModelByEngine finds the whisper entry", () => {
    const entry = defaults.getModelByEngine("whisper");
    expect(entry.key).toBe("whisper-large-v3-turbo-q5");
    expect(entry.model.engine).toBe("whisper");
  });

  it("has recording config with correct values", () => {
    expect(defaults.recording.muteWhileRecording).toBe(true);
  });

  it("has window dimensions", () => {
    expect(defaults.window.width).toBeGreaterThan(0);
    expect(defaults.window.height).toBeGreaterThan(0);
  });

  it('has hotkey "fn" on darwin', () => {
    if (process.platform === "darwin") {
      expect(defaults.hotkey).toBe("fn");
    } else {
      expect(defaults.hotkey).toBe("Ctrl+Space");
    }
  });

  it("has sha256 hashes for every model file", () => {
    for (const model of Object.values(defaults.models)) {
      for (const f of model.files) {
        expect(f.sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });

  it("has whisper language default", () => {
    expect(defaults.getModelByEngine("whisper").model.lang).toBe("auto");
  });
});
