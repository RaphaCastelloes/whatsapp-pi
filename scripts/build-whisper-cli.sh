#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WHISPER_DIR="${WHISPER_DIR:-${ROOT_DIR}/vendor/whisper.cpp}"

if ! command -v cmake >/dev/null 2>&1; then
  echo "cmake is required to build whisper.cpp" >&2
  exit 1
fi

if [[ ! -d "${WHISPER_DIR}/.git" ]]; then
  mkdir -p "$(dirname "${WHISPER_DIR}")"
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git "${WHISPER_DIR}"
fi

cmake -S "${WHISPER_DIR}" -B "${WHISPER_DIR}/build" \
  -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_EXAMPLES=ON \
  -DCMAKE_BUILD_TYPE=Release
cmake --build "${WHISPER_DIR}/build" --config Release -j"${JOBS:-2}" --target whisper-cli

echo "Built ${WHISPER_DIR}/build/bin/whisper-cli"
