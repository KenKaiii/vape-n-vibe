#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Build a current whisper.cpp whisper-server and vendor it into the app.
#
# The whisper-node package bundles a years-old whisper.cpp without
# flash-attention, built-in VAD, or the post-1.8.x ggml performance
# work. This script builds an up-to-date server (pinned tag below) as a
# static binary with the Metal shader embedded, so it needs no runtime
# resources beyond the model files.
#
# Output: vendor/whisper.cpp/whisper-server (gitignored — run this once
# after `npm install`, and automatically via prebuild/predist).

readonly WHISPER_CPP_TAG="v1.8.6"
readonly REPO_URL="https://github.com/ggml-org/whisper.cpp"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT_DIR
readonly VENDOR_DIR="${ROOT_DIR}/vendor/whisper.cpp"
readonly SRC_DIR="${ROOT_DIR}/vendor/whisper.cpp-src"
readonly STAMP_FILE="${VENDOR_DIR}/.build-tag"

main() {
  # Skip if the vendored binary already matches the pinned tag.
  if [[ -x "${VENDOR_DIR}/whisper-server" && -f "${STAMP_FILE}" ]] &&
    [[ "$(cat "${STAMP_FILE}")" == "${WHISPER_CPP_TAG}" ]]; then
    echo "whisper-server ${WHISPER_CPP_TAG} already built — skipping"
    exit 0
  fi

  if [[ ! -d "${SRC_DIR}/.git" ]]; then
    git clone --depth 1 --branch "${WHISPER_CPP_TAG}" "${REPO_URL}" "${SRC_DIR}"
  else
    git -C "${SRC_DIR}" fetch --depth 1 origin "tag" "${WHISPER_CPP_TAG}"
    git -C "${SRC_DIR}" checkout "${WHISPER_CPP_TAG}"
  fi

  local cmake_args=(
    -B "${SRC_DIR}/build"
    -S "${SRC_DIR}"
    -DCMAKE_BUILD_TYPE=Release
    -DBUILD_SHARED_LIBS=OFF
    -DWHISPER_BUILD_TESTS=OFF
  )
  if [[ "$(uname -s)" == "Darwin" ]]; then
    # Embed the Metal shader library in the binary so the server is
    # fully self-contained (no GGML_METAL_PATH_RESOURCES needed).
    cmake_args+=(-DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON)
  fi

  cmake "${cmake_args[@]}"
  cmake --build "${SRC_DIR}/build" --config Release -j --target whisper-server

  mkdir -p "${VENDOR_DIR}"
  cp "${SRC_DIR}/build/bin/whisper-server" "${VENDOR_DIR}/whisper-server"
  echo "${WHISPER_CPP_TAG}" >"${STAMP_FILE}"

  echo "Built whisper-server ${WHISPER_CPP_TAG} -> ${VENDOR_DIR}/whisper-server"
}

main "$@"
