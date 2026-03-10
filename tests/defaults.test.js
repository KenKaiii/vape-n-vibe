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

  it("has model sha256 hash for integrity verification", () => {
    expect(defaults.model.sha256).toBeDefined();
    expect(defaults.model.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("has model language default", () => {
    expect(defaults.model.lang).toBe("auto");
  });
});
