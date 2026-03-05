import init, { WasmBridgeRuntime } from './bifrost_bridge_wasm.js';

const wasmUrl = new URL('./bifrost_bridge_wasm_bg.wasm', import.meta.url);
await init({ module_or_path: wasmUrl });

window.BifrostBridgeWasm = { WasmBridgeRuntime };
