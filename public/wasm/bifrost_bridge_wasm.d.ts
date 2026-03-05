/* tslint:disable */
/* eslint-disable */

export class WasmBridgeRuntime {
    free(): void;
    [Symbol.dispose](): void;
    decode_onboarding_package_json(value: string): string;
    drain_completions_json(): string;
    drain_failures_json(): string;
    drain_outbound_events_json(): string;
    handle_command(command_json: string): void;
    handle_inbound_event(event_json: string): void;
    init_runtime(config_json: string, bootstrap_json: string): void;
    constructor();
    policies_json(): string;
    restore_runtime(config_json: string, snapshot_json: string): void;
    set_policy(policy_json: string): void;
    snapshot_state_json(): string;
    status_json(): string;
    tick(now_unix_secs: bigint): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmbridgeruntime_free: (a: number, b: number) => void;
    readonly wasmbridgeruntime_decode_onboarding_package_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmbridgeruntime_drain_completions_json: (a: number) => [number, number, number, number];
    readonly wasmbridgeruntime_drain_failures_json: (a: number) => [number, number, number, number];
    readonly wasmbridgeruntime_drain_outbound_events_json: (a: number) => [number, number, number, number];
    readonly wasmbridgeruntime_handle_command: (a: number, b: number, c: number) => [number, number];
    readonly wasmbridgeruntime_handle_inbound_event: (a: number, b: number, c: number) => [number, number];
    readonly wasmbridgeruntime_init_runtime: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmbridgeruntime_new: () => number;
    readonly wasmbridgeruntime_policies_json: (a: number) => [number, number, number, number];
    readonly wasmbridgeruntime_restore_runtime: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmbridgeruntime_set_policy: (a: number, b: number, c: number) => [number, number];
    readonly wasmbridgeruntime_snapshot_state_json: (a: number) => [number, number, number, number];
    readonly wasmbridgeruntime_status_json: (a: number) => [number, number, number, number];
    readonly wasmbridgeruntime_tick: (a: number, b: bigint) => [number, number];
    readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
    readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
    readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
