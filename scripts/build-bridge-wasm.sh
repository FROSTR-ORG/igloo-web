#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IGLOO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BIFROST_RS_DIR="${BIFROST_RS_DIR:-${IGLOO_ROOT}/../bifrost-rs}"
WASM_PKG_DIR="${IGLOO_ROOT}/public/wasm"
WASM_OUT_NAME="bifrost_bridge_wasm"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "error: wasm-pack is required (https://rustwasm.github.io/wasm-pack/installer/)" >&2
  exit 1
fi

if ! command -v clang >/dev/null 2>&1; then
  echo "error: clang is required to compile secp256k1 for wasm32-unknown-unknown" >&2
  exit 1
fi

if [[ ! -f "${BIFROST_RS_DIR}/Cargo.toml" ]]; then
  echo "error: bifrost-rs workspace not found at ${BIFROST_RS_DIR}" >&2
  echo "set BIFROST_RS_DIR=/absolute/path/to/bifrost-rs and retry" >&2
  exit 1
fi

mkdir -p "${WASM_PKG_DIR}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

(
  cd "${BIFROST_RS_DIR}"
  wasm-pack build crates/bifrost-bridge-wasm \
    --target web \
    --out-dir "${TMP_DIR}" \
    --out-name "${WASM_OUT_NAME}"
)

cp "${TMP_DIR}/${WASM_OUT_NAME}.js" "${WASM_PKG_DIR}/${WASM_OUT_NAME}.js"
cp "${TMP_DIR}/${WASM_OUT_NAME}.d.ts" "${WASM_PKG_DIR}/${WASM_OUT_NAME}.d.ts"
cp "${TMP_DIR}/${WASM_OUT_NAME}_bg.wasm" "${WASM_PKG_DIR}/${WASM_OUT_NAME}_bg.wasm"

echo "ok: copied wasm artifacts to ${WASM_PKG_DIR}"
