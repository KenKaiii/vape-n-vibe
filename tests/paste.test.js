/**
 * Tests for src/main/paste.js
 *
 * Strategy: paste.js is CommonJS and calls require("electron") lazily (inside
 * the function body). We inject a fake electron entry into Node's require cache
 * before loading paste.js, so getClipboard() returns our in-memory stub.
 * child_process.execFile is similarly shimmed to resolve instantly.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// In-memory clipboard stub
// ---------------------------------------------------------------------------
let _clipboardText = "";
const fakeClipboard = {
  readText: () => _clipboardText,
  writeText: (t) => {
    _clipboardText = t;
  },
};

// ---------------------------------------------------------------------------
// Inject fake electron into require cache BEFORE paste.js is loaded.
// ---------------------------------------------------------------------------
const electronPath = require.resolve("electron");
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: { clipboard: fakeClipboard },
};

// ---------------------------------------------------------------------------
// Inject fake child_process so simulatePaste() resolves without spawning real
// OS commands (osascript / powershell / xdotool).
// ---------------------------------------------------------------------------
const cpPath = require.resolve("node:child_process");
const realCp = require.cache[cpPath]?.exports;
require.cache[cpPath] = {
  id: cpPath,
  filename: cpPath,
  loaded: true,
  exports: {
    ...(realCp || {}),
    execFile: (_cmd, _args, _opts, cb) => {
      const callback = typeof _opts === "function" ? _opts : cb;
      // Resolve asynchronously so await ordering is realistic.
      Promise.resolve().then(() => callback(null, "", ""));
      return {};
    },
  },
};

// ---------------------------------------------------------------------------
// Now load paste.js — it will pick up our injected modules.
// ---------------------------------------------------------------------------
const pastePath = path.resolve(__dirname, "../src/main/paste.js");
delete require.cache[pastePath];
const { pasteText } = require(pastePath);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("pasteText mutex", () => {
  beforeEach(() => {
    _clipboardText = "ORIGINAL";
  });

  it("restores clipboard to the value present before the call", async () => {
    await pasteText("HELLO");
    expect(fakeClipboard.readText()).toBe("ORIGINAL");
  });

  it("serializes concurrent calls so clipboard is restored to original", async () => {
    // Without the mutex the second call would snapshot "A" as its `prev`
    // and restore "A" after it finishes — permanently losing "ORIGINAL".
    const p1 = pasteText("A");
    const p2 = pasteText("B");
    await Promise.all([p1, p2]);

    expect(fakeClipboard.readText()).toBe("ORIGINAL");
  });

  it("clipboard never retains the pasted text after both calls settle", async () => {
    const p1 = pasteText("A");
    const p2 = pasteText("B");
    await Promise.all([p1, p2]);

    const final = fakeClipboard.readText();
    expect(final).not.toBe("A");
    expect(final).not.toBe("B");
  });
});
