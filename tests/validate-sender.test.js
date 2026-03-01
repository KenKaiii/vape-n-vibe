import { describe, it, expect, vi } from "vitest";

vi.mock("../src/main/store", () => ({
  default: { get: vi.fn(), set: vi.fn() },
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("../src/main/download", () => ({
  downloadModels: vi.fn(),
}));

vi.mock("../src/main/hotkey", () => ({
  updateHotkey: vi.fn(),
  checkAccessibility: vi.fn(),
  requestAccessibility: vi.fn(),
}));

vi.mock("../src/main/pipeline", () => ({
  runPipeline: vi.fn(),
}));

import { validateSender } from "../src/main/ipc";

describe("validateSender", () => {
  it("accepts valid file:// URL with /src/renderer/ path", () => {
    const frame = { url: "file:///Users/test/app/src/renderer/index.html" };
    expect(validateSender(frame)).toBe(true);
  });

  it("rejects http:// URL", () => {
    const frame = { url: "http://localhost:3000/src/renderer/index.html" };
    expect(validateSender(frame)).toBe(false);
  });

  it("rejects null frame", () => {
    expect(validateSender(null)).toBe(false);
  });

  it("rejects undefined frame", () => {
    expect(validateSender(undefined)).toBe(false);
  });

  it("rejects frame with no url", () => {
    expect(validateSender({})).toBe(false);
  });

  it("rejects file:// URL without /src/renderer/", () => {
    const frame = { url: "file:///Users/test/app/other/page.html" };
    expect(validateSender(frame)).toBe(false);
  });

  it("rejects malformed URL", () => {
    const frame = { url: "not a valid url" };
    expect(validateSender(frame)).toBe(false);
  });

  it("rejects https:// URL", () => {
    const frame = { url: "https://evil.com/src/renderer/index.html" };
    expect(validateSender(frame)).toBe(false);
  });
});
