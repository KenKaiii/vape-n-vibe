import { describe, it, expect, vi } from "vitest";
import { runPipeline } from "../src/main/pipeline";

describe("runPipeline", () => {
  it("sends processing and transcribing status", async () => {
    const sendStatus = vi.fn();
    const sendOverlay = vi.fn();

    await runPipeline(Buffer.from("wav"), { sendStatus, sendOverlay });

    // These are called before transcribe, so they fire regardless of outcome
    expect(sendOverlay).toHaveBeenCalledWith("processing");
    expect(sendStatus).toHaveBeenCalledWith("transcribing");
  });

  it("resets to idle after transcription error", async () => {
    const sendStatus = vi.fn();
    const sendOverlay = vi.fn();

    // Transcription will fail because there's no valid model file
    await runPipeline(Buffer.from("wav"), { sendStatus, sendOverlay });

    expect(sendStatus).toHaveBeenCalledWith("idle");
    expect(sendOverlay).toHaveBeenCalledWith("idle");
  });

  it("does not throw on transcription error", async () => {
    const sendStatus = vi.fn();
    const sendOverlay = vi.fn();

    await expect(
      runPipeline(Buffer.from("wav"), { sendStatus, sendOverlay }),
    ).resolves.toBeUndefined();
  });

  it("calls sendOverlay before sendStatus on start", async () => {
    const calls = [];
    const sendStatus = vi.fn((s) => calls.push(["status", s]));
    const sendOverlay = vi.fn((m) => calls.push(["overlay", m]));

    await runPipeline(Buffer.from("wav"), { sendStatus, sendOverlay });

    // First call should be sendOverlay("processing")
    expect(calls[0]).toEqual(["overlay", "processing"]);
    // Second call should be sendStatus("transcribing")
    expect(calls[1]).toEqual(["status", "transcribing"]);
  });

  it("always ends with idle status regardless of error", async () => {
    const sendStatus = vi.fn();
    const sendOverlay = vi.fn();

    await runPipeline(Buffer.from("wav"), { sendStatus, sendOverlay });

    // Last calls should be idle
    const statusCalls = sendStatus.mock.calls.map((c) => c[0]);
    const overlayCalls = sendOverlay.mock.calls.map((c) => c[0]);
    expect(statusCalls[statusCalls.length - 1]).toBe("idle");
    expect(overlayCalls[overlayCalls.length - 1]).toBe("idle");
  });
});
