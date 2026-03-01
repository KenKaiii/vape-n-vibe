import { describe, it, expect } from "vitest";
import {
  parseHotkey,
  matchesDown,
  matchesUp,
  toAccelerator,
  updateHotkey,
} from "../src/main/hotkey";
import { UiohookKey } from "uiohook-napi";

describe("parseHotkey", () => {
  it('parses "fn" as fn type', () => {
    expect(parseHotkey("fn")).toEqual({ type: "fn" });
  });

  it("parses Ctrl+Space as key with mods", () => {
    const result = parseHotkey("Ctrl+Space");
    expect(result.type).toBe("key");
    expect(result.keycode).toBe(UiohookKey.Space);
    expect(result.mods).toEqual({ Ctrl: true });
  });

  it("parses Alt alone as mod-only", () => {
    const result = parseHotkey("Alt");
    expect(result.type).toBe("mod-only");
    expect(result.mod).toBe("Alt");
  });

  it("parses Cmd+A as key with mods", () => {
    const result = parseHotkey("Cmd+A");
    expect(result.type).toBe("key");
    expect(result.keycode).toBe(UiohookKey.A);
    expect(result.mods).toEqual({ Cmd: true });
  });

  it("parses Ctrl+Shift+B as key with multiple mods", () => {
    const result = parseHotkey("Ctrl+Shift+B");
    expect(result.type).toBe("key");
    expect(result.keycode).toBe(UiohookKey.B);
    expect(result.mods).toEqual({ Ctrl: true, Shift: true });
  });

  it("returns null keycode for unknown key", () => {
    const result = parseHotkey("Ctrl+Unknown");
    expect(result.type).toBe("key");
    expect(result.keycode).toBeNull();
  });
});

describe("matchesDown", () => {
  it("matches Ctrl+Space with correct event", () => {
    updateHotkey("Ctrl+Space");
    const event = {
      keycode: UiohookKey.Space,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    };
    expect(matchesDown(event)).toBe(true);
  });

  it("rejects wrong keycode", () => {
    updateHotkey("Ctrl+Space");
    const event = {
      keycode: UiohookKey.A,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    };
    expect(matchesDown(event)).toBe(false);
  });

  it("rejects missing modifier", () => {
    updateHotkey("Ctrl+Space");
    const event = {
      keycode: UiohookKey.Space,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    };
    expect(matchesDown(event)).toBe(false);
  });

  it("matches mod-only hotkey", () => {
    updateHotkey("Alt");
    const event = { keycode: UiohookKey.Alt };
    expect(matchesDown(event)).toBe(true);
  });

  it("matches mod-only with right variant", () => {
    updateHotkey("Alt");
    const event = { keycode: UiohookKey.AltRight };
    expect(matchesDown(event)).toBe(true);
  });

  it("returns false for fn type", () => {
    updateHotkey("fn");
    expect(matchesDown({ keycode: 0 })).toBe(false);
  });

  it("matches Cmd+Shift+A with all mods", () => {
    updateHotkey("Cmd+Shift+A");
    const event = {
      keycode: UiohookKey.A,
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
      metaKey: true,
    };
    expect(matchesDown(event)).toBe(true);
  });

  it("rejects Cmd+Shift+A when shift missing", () => {
    updateHotkey("Cmd+Shift+A");
    const event = {
      keycode: UiohookKey.A,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: true,
    };
    expect(matchesDown(event)).toBe(false);
  });
});

describe("matchesUp", () => {
  it("matches correct keycode on key up", () => {
    updateHotkey("Ctrl+Space");
    const event = { keycode: UiohookKey.Space };
    expect(matchesUp(event)).toBe(true);
  });

  it("rejects wrong keycode on key up", () => {
    updateHotkey("Ctrl+Space");
    const event = { keycode: UiohookKey.A };
    expect(matchesUp(event)).toBe(false);
  });

  it("matches mod-only on key up", () => {
    updateHotkey("Alt");
    const event = { keycode: UiohookKey.Alt };
    expect(matchesUp(event)).toBe(true);
  });

  it("returns false for fn type", () => {
    updateHotkey("fn");
    expect(matchesUp({ keycode: 0 })).toBe(false);
  });
});

describe("toAccelerator", () => {
  it('returns null for "fn"', () => {
    expect(toAccelerator("fn")).toBeNull();
  });

  it("converts Ctrl+Space to Control+Space", () => {
    expect(toAccelerator("Ctrl+Space")).toBe("Control+Space");
  });

  it("returns null for mod-only (no non-modifier key)", () => {
    expect(toAccelerator("Alt")).toBeNull();
  });

  it("converts Cmd+A to Command+A", () => {
    expect(toAccelerator("Cmd+A")).toBe("Command+A");
  });

  it("converts Ctrl+Shift+B to Control+Shift+B", () => {
    expect(toAccelerator("Ctrl+Shift+B")).toBe("Control+Shift+B");
  });

  it("converts Win+A to Super+A", () => {
    expect(toAccelerator("Win+A")).toBe("Super+A");
  });
});
