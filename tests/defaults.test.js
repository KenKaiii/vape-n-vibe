import { describe, it, expect } from "vitest";
import defaults from "../src/config/defaults";

describe("defaults", () => {
  it("has model config with required fields", () => {
    expect(defaults.model.name).toBeDefined();
    expect(defaults.model.file).toBeDefined();
    expect(defaults.model.url).toBeDefined();
    expect(defaults.model.url).toMatch(/^https:\/\//);
  });

  it("has recording config with correct values", () => {
    expect(defaults.recording.sampleRate).toBe(16000);
    expect(defaults.recording.channels).toBe(1);
    expect(defaults.recording.bitDepth).toBe(16);
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

  it("has paste config for each platform", () => {
    expect(defaults.paste.darwin).toBeDefined();
    expect(defaults.paste.win32).toBeDefined();
    expect(defaults.paste.linux).toBeDefined();
  });

  it("has model language default", () => {
    expect(defaults.model.lang).toBe("auto");
  });
});
