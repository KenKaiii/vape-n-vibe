#!/usr/bin/env bash
# Smoke tests for packaged Vape 'n' Vibe app (unpacked --dir build).
# Usage: bash scripts/smoke-test.sh <mac|win>
set -uo pipefail

PLATFORM="${1:-}"
PASS=0
FAIL=0
ERRORS=()

pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); ERRORS+=("$1"); echo "  ✗ $1"; }

check_file() {
  local label="$1" path="$2"
  if [[ -f "$path" ]]; then
    pass "$label"
  else
    fail "$label — not found: $path"
  fi
}

check_file_min_size() {
  local label="$1" path="$2" min_bytes="$3"
  if [[ -f "$path" ]]; then
    local size
    size=$(wc -c < "$path" | tr -d ' ')
    if (( size >= min_bytes )); then
      pass "$label (${size} bytes)"
    else
      fail "$label — too small: ${size} bytes (expected >= ${min_bytes})"
    fi
  else
    fail "$label — not found: $path"
  fi
}

kill_app() {
  local pid="$1"
  if [[ "$PLATFORM" == "win" ]]; then
    taskkill //F //T //PID "$pid" >/dev/null 2>&1 || true
  else
    kill "$pid" 2>/dev/null || true
  fi
}

# --- Platform-specific paths ---
case "$PLATFORM" in
  mac)
    APP_DIR="release/mac-arm64/Vape 'n' Vibe.app"
    RESOURCES="$APP_DIR/Contents/Resources"
    UNPACKED="$RESOURCES/app.asar.unpacked"
    WHISPER_BIN="$UNPACKED/node_modules/whisper-node/lib/whisper.cpp/main"
    APP_BINARY="$APP_DIR/Contents/MacOS/Vape 'n' Vibe"
    ;;
  win)
    APP_DIR="release/win-unpacked"
    RESOURCES="$APP_DIR/resources"
    UNPACKED="$RESOURCES/app.asar.unpacked"
    WHISPER_BIN="$UNPACKED/node_modules/whisper-node/lib/whisper.cpp/main.exe"
    APP_BINARY="$APP_DIR/Vape 'n' Vibe.exe"
    ;;
  *)
    echo "Usage: $0 <mac|win>"
    exit 1
    ;;
esac

echo ""
echo "=== Smoke Tests ($PLATFORM) ==="
echo ""

# 1. app.asar exists and is non-trivially sized (>1 MB)
check_file_min_size "app.asar exists and non-trivially sized" \
  "$RESOURCES/app.asar" 1000000

# 2. Whisper binary at expected path
check_file "Whisper binary exists" "$WHISPER_BIN"

# 3. whisper.dll alongside binary (Windows only)
if [[ "$PLATFORM" == "win" ]]; then
  check_file "whisper.dll exists" \
    "$UNPACKED/node_modules/whisper-node/lib/whisper.cpp/whisper.dll"
fi

# 4. Whisper binary runs (--help)
if [[ -f "$WHISPER_BIN" ]]; then
  if "$WHISPER_BIN" --help >/dev/null 2>&1; then
    pass "Whisper binary runs (--help)"
  else
    fail "Whisper binary fails to run (exit code $?)"
  fi
else
  fail "Whisper binary runs — skipped (binary missing)"
fi

# 5. Whisper binary is arm64 (macOS only)
if [[ "$PLATFORM" == "mac" ]]; then
  if [[ -f "$WHISPER_BIN" ]]; then
    if file "$WHISPER_BIN" | grep -q "arm64"; then
      pass "Whisper binary is arm64"
    else
      fail "Whisper binary is NOT arm64: $(file "$WHISPER_BIN")"
    fi
  else
    fail "Whisper binary arch check — skipped (binary missing)"
  fi
fi

# 6. llama-addon.node in unpacked modules
LLAMA_ADDON=$(find "$UNPACKED" -name "llama-addon.node" 2>/dev/null | head -1)
if [[ -n "$LLAMA_ADDON" ]]; then
  pass "llama-addon.node found"
else
  fail "llama-addon.node not found in $UNPACKED"
fi

# 7. uiohook-napi .node exists
UIOHOOK_ADDON=$(find "$UNPACKED" -name "*.node" -path "*/uiohook*" 2>/dev/null | head -1)
if [[ -n "$UIOHOOK_ADDON" ]]; then
  pass "uiohook-napi .node found"
else
  fail "uiohook-napi .node not found in $UNPACKED"
fi

# 8. fn_key_monitor.node exists (macOS only)
if [[ "$PLATFORM" == "mac" ]]; then
  FN_MONITOR=$(find "$RESOURCES" -name "fn_key_monitor.node" 2>/dev/null | head -1)
  if [[ -n "$FN_MONITOR" ]]; then
    pass "fn_key_monitor.node found"
  else
    fail "fn_key_monitor.node not found in $RESOURCES"
  fi
fi

# 9. App launches and survives 15s
echo ""
echo "  Starting app for launch test (15s)..."
"$APP_BINARY" --no-sandbox --disable-gpu &
APP_PID=$!
sleep 15
if kill -0 "$APP_PID" 2>/dev/null; then
  kill_app "$APP_PID"
  # Wait up to 10s for process to exit, then force kill
  for i in $(seq 1 10); do
    kill -0 "$APP_PID" 2>/dev/null || break
    sleep 1
  done
  # If still alive, force SIGKILL (unix) or accept it's done (win)
  if kill -0 "$APP_PID" 2>/dev/null; then
    kill -9 "$APP_PID" 2>/dev/null || true
  fi
  wait "$APP_PID" 2>/dev/null || true
  pass "App launches and survives 15s"
else
  wait "$APP_PID" 2>/dev/null || true
  fail "App crashed within 15s"
fi

# --- Summary ---
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if (( FAIL > 0 )); then
  echo ""
  echo "Failures:"
  for err in "${ERRORS[@]}"; do
    echo "  - $err"
  done
  exit 1
fi
