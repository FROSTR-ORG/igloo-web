export type WasmBridgeRuntimeApi = {
  init_runtime: (configJson: string, bootstrapJson: string) => void;
  restore_runtime: (configJson: string, snapshotJson: string) => void;
  handle_command: (commandJson: string) => void;
  handle_inbound_event: (eventJson: string) => void;
  tick: (nowUnixSecs: number) => void;
  drain_outbound_events_json: () => string;
  drain_completions_json: () => string;
  drain_failures_json: () => string;
  snapshot_state_json: () => string;
  status_json: () => string;
  policies_json: () => string;
  set_policy: (policyJson: string) => void;
  decode_onboarding_package_json: (value: string) => string;
};

type WasmBridgeModule = {
  WasmBridgeRuntime: new () => {
    init_runtime: (configJson: string, bootstrapJson: string) => void;
    restore_runtime: (configJson: string, snapshotJson: string) => void;
    handle_command: (commandJson: string) => void;
    handle_inbound_event: (eventJson: string) => void;
    tick: (nowUnixSecs: bigint) => void;
    drain_outbound_events_json: () => string;
    drain_completions_json: () => string;
    drain_failures_json: () => string;
    snapshot_state_json: () => string;
    status_json: () => string;
    policies_json: () => string;
    set_policy: (policyJson: string) => void;
    decode_onboarding_package_json: (value: string) => string;
  };
};

declare global {
  interface Window {
    BifrostBridgeWasm?: WasmBridgeModule;
  }
}

let cachedModule: WasmBridgeModule | null = null;

export async function loadWasmBridgeModule(): Promise<WasmBridgeModule> {
  if (cachedModule) return cachedModule;

  const globalModule =
    typeof window !== 'undefined' ? window.BifrostBridgeWasm : undefined;
  if (globalModule?.WasmBridgeRuntime) {
    cachedModule = globalModule;
    return globalModule;
  }

  const modulePath = '/wasm/bifrost_bridge_wasm_loader.mjs';
  if (typeof window === 'undefined') {
    throw new Error('WASM bridge module can only load in browser environments');
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(
        'script[data-bifrost-wasm-loader="1"]'
      ) as HTMLScriptElement | null;
      if (existing) {
        if (window.BifrostBridgeWasm?.WasmBridgeRuntime) {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error(`Failed to load ${modulePath}`)),
          { once: true }
        );
        return;
      }

      const script = document.createElement('script');
      script.type = 'module';
      script.async = true;
      script.src = modulePath;
      script.dataset.bifrostWasmLoader = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${modulePath}`));
      document.head.appendChild(script);
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'unknown dynamic import error';
    throw new Error(
      `Failed to load ${modulePath}. Run "npm run build:bridge-wasm" first. (${message})`
    );
  }

  let globalRuntimeCtor = window.BifrostBridgeWasm?.WasmBridgeRuntime;
  if (!globalRuntimeCtor) {
    const deadline = Date.now() + 3000;
    while (!globalRuntimeCtor && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      globalRuntimeCtor = window.BifrostBridgeWasm?.WasmBridgeRuntime;
    }
  }
  if (!globalRuntimeCtor) {
    throw new Error(
      'WASM bridge module loaded but WasmBridgeRuntime export is missing'
    );
  }

  cachedModule = { WasmBridgeRuntime: globalRuntimeCtor };
  return cachedModule;
}

export async function createWasmBridgeRuntime(): Promise<WasmBridgeRuntimeApi> {
  const module = await loadWasmBridgeModule();
  const raw = new module.WasmBridgeRuntime();
  return {
    init_runtime: raw.init_runtime.bind(raw),
    restore_runtime: raw.restore_runtime.bind(raw),
    handle_command: raw.handle_command.bind(raw),
    handle_inbound_event: raw.handle_inbound_event.bind(raw),
    tick: (nowUnixSecs: number) => raw.tick(BigInt(nowUnixSecs)),
    drain_outbound_events_json: raw.drain_outbound_events_json.bind(raw),
    drain_completions_json: raw.drain_completions_json.bind(raw),
    drain_failures_json: raw.drain_failures_json.bind(raw),
    snapshot_state_json: raw.snapshot_state_json.bind(raw),
    status_json: raw.status_json.bind(raw),
    policies_json: raw.policies_json.bind(raw),
    set_policy: raw.set_policy.bind(raw),
    decode_onboarding_package_json: raw.decode_onboarding_package_json.bind(raw)
  };
}
