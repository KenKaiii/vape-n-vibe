const path = require("node:path");
const { uIOhook, UiohookKey } = require("uiohook-napi");
const { systemPreferences, shell } = require("electron");

// --- Native fn key monitor (macOS only) ---
let fnMonitor = null;
try {
  fnMonitor = require(
    path.join(__dirname, "..", "..", "build", "Release", "fn_key_monitor.node"),
  );
} catch {
  console.log("[hotkey] Native fn_key_monitor not available");
}

// --- uiohook key mapping ---
const KEY_MAP = {
  A: UiohookKey.A,
  B: UiohookKey.B,
  C: UiohookKey.C,
  D: UiohookKey.D,
  E: UiohookKey.E,
  F: UiohookKey.F,
  G: UiohookKey.G,
  H: UiohookKey.H,
  I: UiohookKey.I,
  J: UiohookKey.J,
  K: UiohookKey.K,
  L: UiohookKey.L,
  M: UiohookKey.M,
  N: UiohookKey.N,
  O: UiohookKey.O,
  P: UiohookKey.P,
  Q: UiohookKey.Q,
  R: UiohookKey.R,
  S: UiohookKey.S,
  T: UiohookKey.T,
  U: UiohookKey.U,
  V: UiohookKey.V,
  W: UiohookKey.W,
  X: UiohookKey.X,
  Y: UiohookKey.Y,
  Z: UiohookKey.Z,
  Space: UiohookKey.Space,
  Enter: UiohookKey.Enter,
  Tab: UiohookKey.Tab,
  F1: UiohookKey.F1,
  F2: UiohookKey.F2,
  F3: UiohookKey.F3,
  F4: UiohookKey.F4,
  F5: UiohookKey.F5,
  F6: UiohookKey.F6,
  F7: UiohookKey.F7,
  F8: UiohookKey.F8,
  F9: UiohookKey.F9,
  F10: UiohookKey.F10,
  F11: UiohookKey.F11,
  F12: UiohookKey.F12,
};

const MOD_KEYCODES = {
  Ctrl: [UiohookKey.Ctrl, UiohookKey.CtrlRight],
  Alt: [UiohookKey.Alt, UiohookKey.AltRight],
  Shift: [UiohookKey.Shift, UiohookKey.ShiftRight],
  Cmd: [UiohookKey.Meta, UiohookKey.MetaRight],
};

// --- State ---
let callbacks = null;
let parsed = null;
let active = false;
let uiohookStarted = false;
let fnMonitorStarted = false;

function parseHotkey(hotkey) {
  if (hotkey === "fn") return { type: "fn" };

  const parts = hotkey.split("+");
  const mods = {};
  let keyName = null;

  for (const p of parts) {
    if (MOD_KEYCODES[p]) mods[p] = true;
    else keyName = p;
  }

  // Single modifier key (e.g. just "Alt")
  if (!keyName && Object.keys(mods).length === 1) {
    return { type: "mod-only", mod: Object.keys(mods)[0] };
  }

  return { type: "key", keycode: KEY_MAP[keyName] || null, mods };
}

function matchesDown(e) {
  if (!parsed || parsed.type === "fn") return false;
  if (parsed.type === "mod-only") {
    return MOD_KEYCODES[parsed.mod].includes(e.keycode);
  }
  if (e.keycode !== parsed.keycode) return false;
  if (parsed.mods.Alt && !e.altKey) return false;
  if (parsed.mods.Ctrl && !e.ctrlKey) return false;
  if (parsed.mods.Shift && !e.shiftKey) return false;
  if (parsed.mods.Cmd && !e.metaKey) return false;
  return true;
}

function matchesUp(e) {
  if (!parsed || parsed.type === "fn") return false;
  if (parsed.type === "mod-only") {
    return MOD_KEYCODES[parsed.mod].includes(e.keycode);
  }
  return e.keycode === parsed.keycode;
}

// --- Start/stop native fn monitor ---
function startFnMonitor() {
  if (fnMonitorStarted || !fnMonitor) return;
  const ok = fnMonitor.startMonitoring((event) => {
    if (!callbacks) return;
    if (event === "FN_KEY_DOWN" && !active) {
      active = true;
      console.log("[hotkey] fn DOWN");
      callbacks.onDown();
    } else if (event === "FN_KEY_UP" && active) {
      active = false;
      console.log("[hotkey] fn UP");
      callbacks.onUp();
    }
  });
  fnMonitorStarted = ok;
  console.log("[hotkey] fn monitor started:", ok);
}

function stopFnMonitor() {
  if (!fnMonitorStarted || !fnMonitor) return;
  fnMonitor.stopMonitoring();
  fnMonitorStarted = false;
}

// --- Start/stop uiohook ---
function startUiohook() {
  if (uiohookStarted) return;

  uIOhook.on("keydown", (e) => {
    if (!callbacks || active) return;
    if (matchesDown(e)) {
      active = true;
      console.log("[hotkey] key DOWN:", e.keycode);
      callbacks.onDown();
    }
  });

  uIOhook.on("keyup", (e) => {
    if (!callbacks || !active) return;
    if (matchesUp(e)) {
      active = false;
      console.log("[hotkey] key UP:", e.keycode);
      callbacks.onUp();
    }
  });

  uIOhook.start();
  uiohookStarted = true;
  console.log("[hotkey] uiohook started");
}

// --- Public API ---
function checkAccessibility() {
  if (process.platform !== "darwin") return true;
  if (fnMonitor && fnMonitor.checkAccessibilityPermissions) {
    return fnMonitor.checkAccessibilityPermissions();
  }
  return systemPreferences.isTrustedAccessibilityClient(false);
}

function requestAccessibility() {
  if (process.platform !== "darwin") return;
  if (fnMonitor && fnMonitor.checkAccessibilityPermissions) {
    fnMonitor.checkAccessibilityPermissions(); // prompts via AXIsProcessTrustedWithOptions
  } else {
    systemPreferences.isTrustedAccessibilityClient(true);
  }
  shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  );
}

function registerHotkey(hotkey, cbs) {
  callbacks = cbs;
  parsed = parseHotkey(hotkey);
  active = false;

  console.log("[hotkey] Registering:", hotkey, "→", parsed.type);

  if (parsed.type === "fn") {
    if (process.platform !== "darwin") {
      console.warn(
        "[hotkey] fn key is not available on this platform — falling back to uiohook",
      );
      stopFnMonitor();
      startUiohook();
    } else {
      stopFnMonitor();
      startFnMonitor();
    }
  } else {
    stopFnMonitor();
    startUiohook();
  }
}

function updateHotkey(hotkey) {
  parsed = parseHotkey(hotkey);
  active = false;
  console.log("[hotkey] Updated:", hotkey, "→", parsed.type);

  if (parsed.type === "fn") {
    if (process.platform !== "darwin") {
      console.warn(
        "[hotkey] fn key is not available on this platform — using uiohook",
      );
      stopFnMonitor();
      if (!uiohookStarted) startUiohook();
    } else {
      startFnMonitor();
    }
  } else {
    stopFnMonitor();
    if (!uiohookStarted) startUiohook();
  }
}

function stopHotkey() {
  stopFnMonitor();
  if (uiohookStarted) {
    uIOhook.stop();
    uiohookStarted = false;
  }
}

module.exports = {
  registerHotkey,
  updateHotkey,
  stopHotkey,
  checkAccessibility,
  requestAccessibility,
};
