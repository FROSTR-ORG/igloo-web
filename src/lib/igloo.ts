import { SimplePool, finalizeEvent, nip44, type Event, type Filter } from 'nostr-tools';

import type { PeerPolicy } from '@/components/ui/peer-list';
import {
  createWasmBridgeRuntime,
  type WasmBridgeRuntimeApi
} from '@/lib/bridge-wasm-runtime';
import {
  normalizeNip44PayloadForJs,
  normalizeNip44PayloadForRust
} from '@/lib/nip44-normalize';

const DEFAULT_RELAYS_FALLBACK = ['ws://127.0.0.1:8194'];

function envDefaultRelays(): string[] {
  const raw = import.meta.env.VITE_DEFAULT_RELAYS;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return DEFAULT_RELAYS_FALLBACK;
  }
  const parsed = raw
    .split(/[,\s]+/)
    .map((relay) => relay.trim())
    .filter(Boolean);
  return parsed.length ? parsed : DEFAULT_RELAYS_FALLBACK;
}

export const DEFAULT_RELAYS = envDefaultRelays();

const BIFROST_EVENT_KIND_RAW = Number(import.meta.env.VITE_BIFROST_EVENT_KIND ?? 20000);
const BIFROST_EVENT_KIND = Number.isFinite(BIFROST_EVENT_KIND_RAW)
  ? BIFROST_EVENT_KIND_RAW
  : 20000;
const ONBOARD_TIMEOUT_MS = 20_000;
const PING_TIMEOUT_MS = 12_000;
const PEER_ONLINE_GRACE_SECS = 120;

type RuntimeConfig = {
  onboardPackage: string;
  relays: string[];
};

type OnboardingDecoded = {
  share: {
    idx: number;
    seckey: string;
  };
  share_pubkey33: string;
  peer_pk_xonly: string;
  relays: string[];
};

type GroupMemberWire = {
  idx: number;
  pubkey: string;
};

type GroupPackageWire = {
  group_pk: string;
  threshold: number;
  members: GroupMemberWire[];
};

type OnboardResponseWire = {
  group: GroupPackageWire;
  nonces: unknown[];
};

type BridgeEnvelope = {
  request_id: string;
  sent_at: number;
  payload: {
    type: string;
    data: unknown;
  };
};

export type ValidationResult = {
  isValid: boolean;
  error?: string;
};

export type PingResult = {
  success: boolean;
  latency?: number;
  error?: string;
};

export type NodeWithEvents = {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type PeerPolicyPatch = {
  send: boolean;
  receive: boolean;
};

type PendingPing = {
  peer: string;
  startedAtMs: number;
  resolve: (value: PingResult) => void;
};

const ensureArray = (value: string[]) =>
  Array.from(new Set(value.map((relay) => relay.replace(/\/$/, ''))));

function nowUnixSecs(): number {
  return Math.floor(Date.now() / 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toErrorMessage(value: unknown, fallback = 'Request failed'): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (value instanceof Error && value.message) return value.message;
  if (isRecord(value)) {
    const message = value.message;
    if (typeof message === 'string' && message.trim()) return message;
    const error = value.error;
    if (typeof error === 'string' && error.trim()) return error;
    const reason = value.reason;
    if (typeof reason === 'string' && reason.trim()) return reason;
  }
  return fallback;
}

function withContext(step: string, error: unknown): Error {
  return new Error(`${step}: ${toErrorMessage(error, 'unknown error')}`);
}

function isRelayUrl(value: string): boolean {
  return /^wss?:\/\/.+/.test(value);
}

function hexToBytes(value: string): Uint8Array {
  const hex = value.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid hex payload');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function parseBridgeEnvelope(value: string): BridgeEnvelope | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return null;
    if (typeof parsed.request_id !== 'string') return null;
    if (!isRecord(parsed.payload)) return null;
    if (typeof parsed.payload.type !== 'string') return null;
    return {
      request_id: parsed.request_id,
      sent_at: Number(parsed.sent_at ?? 0),
      payload: {
        type: parsed.payload.type,
        data: parsed.payload.data
      }
    };
  } catch {
    return null;
  }
}

function allPolicyFlagsEnabled(value: unknown): boolean {
  if (!isRecord(value)) return true;
  const flags = ['echo', 'ping', 'onboard', 'sign', 'ecdh'];
  return flags.every((key) => value[key] !== false);
}

function parsePingCompletion(completion: unknown): { requestId: string; peer: string } | null {
  if (!isRecord(completion)) return null;
  const payload = completion.Ping;
  if (!isRecord(payload)) return null;

  const requestId = payload.request_id;
  const peer = payload.peer;
  if (typeof requestId !== 'string' || typeof peer !== 'string') return null;
  return { requestId, peer };
}

class BrowserBridgeNode implements NodeWithEvents {
  private handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  private pool: SimplePool | null = null;
  private relaySubscription: { close: (reason?: string) => void } | null = null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private runtime: WasmBridgeRuntimeApi | null = null;

  private activeRelays: string[] = [];
  private localPubkey33 = '';
  private peerPubkeys33 = new Set<string>();
  private xonlyToPeer33 = new Map<string, string>();
  private peerLastSeenAt = new Map<string, number>();
  private pendingPings: PendingPing[] = [];

  constructor(private readonly config: RuntimeConfig) {}

  on(event: string, handler: (...args: unknown[]) => void) {
    const set = this.handlers.get(event) || new Set();
    set.add(handler);
    this.handlers.set(event, set);
  }

  off(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.get(event)?.delete(handler);
  }

  removeListener(event: string, handler: (...args: unknown[]) => void) {
    this.off(event, handler);
  }

  private emit(event: string, ...args: unknown[]) {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(...args);
    }
  }

  async connect() {
    try {
      this.runtime = await createWasmBridgeRuntime();
    } catch (error) {
      throw withContext('Failed to load WASM runtime', error);
    }

    let decoded: OnboardingDecoded;
    try {
      decoded = this.decodeOnboardingPackage(this.config.onboardPackage);
    } catch (error) {
      throw withContext('Failed to decode onboarding package', error);
    }
    this.localPubkey33 = decoded.share_pubkey33.toLowerCase();

    const mergedRelays = normalizeRelays([...this.config.relays, ...decoded.relays]);
    this.activeRelays = mergedRelays.relays;

    this.pool = new SimplePool();

    let onboardResponse: OnboardResponseWire;
    try {
      onboardResponse = await this.requestOnboardResponse(decoded);
    } catch (error) {
      throw withContext('Failed during onboard request', error);
    }
    const group = onboardResponse.group;

    this.peerPubkeys33 = new Set(
      group.members
        .map((member) => member.pubkey.toLowerCase())
        .filter((pubkey) => pubkey !== this.localPubkey33)
    );

    this.xonlyToPeer33.clear();
    for (const member of group.members) {
      const peer33 = member.pubkey.toLowerCase();
      this.xonlyToPeer33.set(peer33.slice(2), peer33);
    }

    const bootstrap = {
      group,
      share: decoded.share,
      peers: Array.from(this.peerPubkeys33)
    };

    const runtimeConfig = {
      device: {
        sign_timeout_secs: 30,
        ecdh_timeout_secs: 30,
        ping_timeout_secs: 15,
        onboard_timeout_secs: 30,
        request_ttl_secs: 300,
        max_future_skew_secs: 30,
        request_cache_limit: 2048,
        state_save_interval_secs: 30,
        event_kind: BIFROST_EVENT_KIND,
        peer_selection_strategy: 'deterministic_sorted'
      }
    };

    try {
      this.runtime.init_runtime(JSON.stringify(runtimeConfig), JSON.stringify(bootstrap));
    } catch (error) {
      throw withContext('Failed to initialize signer runtime', error);
    }

    this.subscribeRelayIngress();

    this.tickHandle = setInterval(() => {
      this.pumpRuntime(nowUnixSecs());
    }, 1_000);

    this.pumpRuntime(nowUnixSecs());

    for (const peer of this.peerPubkeys33) {
      this.runtime.handle_command(
        JSON.stringify({ type: 'ping', peer_pubkey33_hex: peer })
      );
    }
    this.pumpRuntime(nowUnixSecs());

    this.emit('message', {
      tag: '/runtime/bootstrap',
      relays: this.activeRelays,
      peers: Array.from(this.peerPubkeys33),
      event_kind: BIFROST_EVENT_KIND
    });

    this.emit('ready');
  }

  async shutdown() {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }

    this.relaySubscription?.close('shutdown');
    this.relaySubscription = null;

    if (this.pool) {
      this.pool.close(this.activeRelays);
      this.pool.destroy();
      this.pool = null;
    }

    while (this.pendingPings.length > 0) {
      const pending = this.pendingPings.shift();
      pending?.resolve({ success: false, error: 'Signer stopped' });
    }

    this.emit('closed');
  }

  async fetchPeers(seed: PeerPolicy[]): Promise<PeerPolicy[]> {
    if (!this.runtime) throw new Error('runtime not initialized');

    const base = new Map<string, PeerPolicy>();
    for (const peer of seed) {
      base.set(peer.pubkey.toLowerCase(), peer);
    }

    try {
      const policiesJson = this.runtime.policies_json();
      const policiesParsed = JSON.parse(policiesJson) as unknown;
      if (isRecord(policiesParsed)) {
        for (const [pubkey, policy] of Object.entries(policiesParsed)) {
          const normalized = pubkey.toLowerCase();
          const existing = base.get(normalized);
          base.set(normalized, {
            alias: existing?.alias || `Peer ${base.size + 1}`,
            pubkey,
            send: allPolicyFlagsEnabled(isRecord(policy) ? policy.request : undefined),
            receive: allPolicyFlagsEnabled(isRecord(policy) ? policy.respond : undefined),
            state: existing?.state || 'offline'
          });
        }
      }
    } catch (error) {
      this.emit('message', {
        tag: '/runtime/policies-error',
        error: toErrorMessage(error, 'failed to read policies')
      });
    }

    for (const peer of this.peerPubkeys33) {
      if (!base.has(peer)) {
        base.set(peer, {
          alias: `Peer ${base.size + 1}`,
          pubkey: peer,
          send: true,
          receive: true,
          state: 'offline'
        });
      }
    }

    const now = nowUnixSecs();
    const peers = Array.from(base.values()).map((peer) => {
      const normalized = peer.pubkey.toLowerCase();
      const seen = this.peerLastSeenAt.get(normalized) || 0;
      const online = now - seen <= PEER_ONLINE_GRACE_SECS;
      return {
        ...peer,
        pubkey: normalized,
        state: online ? 'online' : 'offline'
      } as PeerPolicy;
    });

    peers.sort((a, b) => a.pubkey.localeCompare(b.pubkey));
    return peers;
  }

  async pingPeer(pubkey: string): Promise<PingResult> {
    if (!this.runtime) return { success: false, error: 'runtime not initialized' };

    const normalized = pubkey.toLowerCase();

    return await new Promise<PingResult>((resolve) => {
      const pending: PendingPing = {
        peer: normalized,
        startedAtMs: Date.now(),
        resolve
      };

      this.pendingPings.push(pending);

      setTimeout(() => {
        const index = this.pendingPings.indexOf(pending);
        if (index >= 0) {
          this.pendingPings.splice(index, 1);
          resolve({ success: false, error: 'Ping timed out' });
        }
      }, PING_TIMEOUT_MS);

      try {
        this.runtime?.handle_command(
          JSON.stringify({ type: 'ping', peer_pubkey33_hex: normalized })
        );
        this.pumpRuntime(nowUnixSecs());
      } catch (error) {
        const index = this.pendingPings.indexOf(pending);
        if (index >= 0) this.pendingPings.splice(index, 1);
        resolve({ success: false, error: toErrorMessage(error, 'Ping failed') });
      }
    });
  }

  async updatePeerPolicy(pubkey: string, policy: PeerPolicyPatch): Promise<void> {
    if (!this.runtime) throw new Error('runtime not initialized');

    this.runtime.set_policy(
      JSON.stringify({
        peer: pubkey.toLowerCase(),
        send: policy.send,
        receive: policy.receive
      })
    );

    this.pumpRuntime(nowUnixSecs());
  }

  private decodeOnboardingPackage(value: string): OnboardingDecoded {
    if (!this.runtime) {
      throw new Error('runtime not initialized');
    }

    const decodedJson = this.runtime.decode_onboarding_package_json(value.trim());
    const decoded = JSON.parse(decodedJson) as unknown;
    if (!isRecord(decoded)) {
      throw new Error('Invalid onboarding package decode result');
    }

    if (!isRecord(decoded.share)) {
      throw new Error('Onboarding package missing share payload');
    }

    const idx = decoded.share.idx;
    const seckey = decoded.share.seckey;
    const sharePubkey33 = decoded.share_pubkey33;
    const peerPkXonly = decoded.peer_pk_xonly;
    const relays = decoded.relays;

    if (typeof idx !== 'number' || typeof seckey !== 'string') {
      throw new Error('Invalid onboarding share payload');
    }
    if (typeof sharePubkey33 !== 'string' || sharePubkey33.length !== 66) {
      throw new Error('Invalid onboarding share pubkey');
    }
    if (typeof peerPkXonly !== 'string' || peerPkXonly.length !== 64) {
      throw new Error('Invalid onboarding peer key');
    }

    return {
      share: { idx, seckey },
      share_pubkey33: sharePubkey33,
      peer_pk_xonly: peerPkXonly,
      relays: Array.isArray(relays)
        ? relays.filter((relay): relay is string => typeof relay === 'string')
        : []
    };
  }

  private async requestOnboardResponse(
    decoded: OnboardingDecoded
  ): Promise<OnboardResponseWire> {
    if (!this.pool) throw new Error('relay pool not initialized');

    const now = nowUnixSecs();
    const requestId = `${now}-${decoded.share.idx}-1`;
    const shareSecret = hexToBytes(decoded.share.seckey);

    const requestEnvelope: BridgeEnvelope = {
      request_id: requestId,
      sent_at: now,
      payload: {
        type: 'OnboardRequest',
        data: {
          share_pk: decoded.share_pubkey33.toLowerCase(),
          idx: decoded.share.idx
        }
      }
    };

    const conversationKey = nip44.v2.utils.getConversationKey(
      shareSecret,
      decoded.peer_pk_xonly
    );

    const filter: Filter = {
      kinds: [BIFROST_EVENT_KIND],
      authors: [decoded.peer_pk_xonly],
      since: now - 5
    };

    return await new Promise<OnboardResponseWire>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      const timer = setTimeout(() => {
        finish(() => {
          subscription.close('onboard-timeout');
          reject(
            new Error(
              `Onboard response timed out (request_id=${requestId}, relays=${this.activeRelays.join(',')})`
            )
          );
        });
      }, ONBOARD_TIMEOUT_MS);

      const subscription = this.pool!.subscribeMany(this.activeRelays, filter, {
        onevent: (event: Event) => {
          try {
            const decrypted = nip44.v2.decrypt(
              normalizeNip44PayloadForJs(event.content),
              conversationKey
            );
            const envelope = parseBridgeEnvelope(decrypted);
            if (!envelope) return;
            if (envelope.request_id !== requestId) return;
            if (envelope.payload.type !== 'OnboardResponse') return;
            if (!isRecord(envelope.payload.data)) return;
            if (!isRecord(envelope.payload.data.group)) return;

            finish(() => {
              clearTimeout(timer);
              subscription.close('onboard-complete');
              resolve(envelope.payload.data as OnboardResponseWire);
            });
          } catch {
            // Ignore unrelated payloads.
          }
        },
        onclose: (reasons) => {
          if (settled) return;
          finish(() => {
            clearTimeout(timer);
            reject(
              new Error(
                `Relay subscription closed before onboard response: ${reasons.join(', ')}`
              )
            );
          });
        }
      });

      const encrypted = normalizeNip44PayloadForRust(
        nip44.v2.encrypt(JSON.stringify(requestEnvelope), conversationKey)
      );
      const event = finalizeEvent(
        {
          kind: BIFROST_EVENT_KIND,
          tags: [],
          content: encrypted,
          created_at: now
        },
        shareSecret
      );

      const publishResults = this.pool!.publish(this.activeRelays, event);
      Promise.allSettled(publishResults).then((results) => {
        const hasSuccess = results.some((entry) => entry.status === 'fulfilled');
        if (!hasSuccess && !settled) {
          finish(() => {
            clearTimeout(timer);
            subscription.close('onboard-publish-failed');
            reject(
              new Error(
                `Failed to publish onboard request to relays (request_id=${requestId})`
              )
            );
          });
        }
      });
    });
  }

  private subscribeRelayIngress() {
    if (!this.pool) throw new Error('relay pool not initialized');

    const authors = Array.from(this.xonlyToPeer33.keys());
    const filter: Filter = {
      kinds: [BIFROST_EVENT_KIND],
      authors
    };

    this.relaySubscription = this.pool.subscribeMany(this.activeRelays, filter, {
      onevent: (event: Event) => {
        const sender = this.xonlyToPeer33.get(event.pubkey.toLowerCase());
        if (sender) {
          this.peerLastSeenAt.set(sender, event.created_at);
        }

        try {
          this.runtime?.handle_inbound_event(JSON.stringify(event));
          this.pumpRuntime(nowUnixSecs());
        } catch (error) {
          this.emit('message', {
            tag: '/runtime/inbound-error',
            error: toErrorMessage(error, 'failed to ingest inbound event')
          });
        }

        this.emit('message', {
          tag: '/relay/inbound',
          event: {
            id: event.id,
            pubkey: event.pubkey,
            created_at: event.created_at,
            kind: event.kind
          }
        });
      },
      onclose: (reasons) => {
        this.emit('message', {
          tag: '/relay/closed',
          reasons
        });
      }
    });
  }

  private pumpRuntime(now: number) {
    if (!this.runtime) return;

    try {
      this.runtime.tick(now);

      const outboundRaw = this.runtime.drain_outbound_events_json();
      const outboundEvents = JSON.parse(outboundRaw) as unknown;
      if (Array.isArray(outboundEvents) && this.pool) {
        for (const event of outboundEvents) {
          if (!isRecord(event)) continue;
          const outboundEvent = event as unknown as Event;
          const publishResults = this.pool.publish(this.activeRelays, outboundEvent);
          Promise.allSettled(publishResults).then((results) => {
            const succeeded = results.filter((entry) => entry.status === 'fulfilled').length;
            this.emit('message', {
              tag: '/relay/publish',
              event_id: outboundEvent.id,
              relays_ok: succeeded,
              relays_total: results.length
            });
          });
        }
      }

      const completionsRaw = this.runtime.drain_completions_json();
      const completions = JSON.parse(completionsRaw) as unknown;
      if (Array.isArray(completions)) {
        for (const completion of completions) {
          this.emit('message', { tag: '/runtime/completion', completion });

          const ping = parsePingCompletion(completion);
          if (ping) {
            const index = this.pendingPings.findIndex(
              (entry) => entry.peer === ping.peer.toLowerCase()
            );
            if (index >= 0) {
              const pending = this.pendingPings.splice(index, 1)[0];
              pending.resolve({
                success: true,
                latency: Date.now() - pending.startedAtMs
              });
            }
          }
        }
      }

      const failuresRaw = this.runtime.drain_failures_json();
      const failures = JSON.parse(failuresRaw) as unknown;
      if (Array.isArray(failures)) {
        for (const failure of failures) {
          this.emit('message', { tag: '/runtime/failure', failure });

          if (this.pendingPings.length > 0) {
            const pending = this.pendingPings.shift();
            pending?.resolve({
              success: false,
              error: 'Ping round failed'
            });
          }
        }
      }
    } catch (error) {
      this.emit('error', new Error(toErrorMessage(error, 'Runtime pump failed')));
    }
  }
}

function isBrowserBridgeNode(node: NodeWithEvents): node is BrowserBridgeNode {
  return (
    typeof (node as BrowserBridgeNode).connect === 'function' &&
    typeof (node as BrowserBridgeNode).shutdown === 'function' &&
    typeof (node as BrowserBridgeNode).fetchPeers === 'function'
  );
}

export function validateOnboardCredential(value: string): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Onboarding package is required' };
  }

  if (!trimmed.startsWith('bfonboard1')) {
    return { isValid: false, error: 'Onboarding package must start with bfonboard1' };
  }

  if (!/^bfonboard1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(trimmed)) {
    return { isValid: false, error: 'Onboarding package must be valid bech32m text' };
  }

  if (trimmed.length < 48) {
    return { isValid: false, error: 'Onboarding package is too short' };
  }

  return { isValid: true };
}

export function normalizeRelays(relays: string[]): { relays: string[]; errors: string[] } {
  const base = relays.filter((relay) => typeof relay === 'string' && relay.trim().length > 0);
  const normalized = ensureArray(base.map((relay) => relay.trim()));

  const valid = normalized.filter(isRelayUrl);
  const errors = normalized
    .filter((relay) => !isRelayUrl(relay))
    .map((relay) => `Invalid relay URL: ${relay}`);

  return {
    relays: valid.length ? valid : DEFAULT_RELAYS,
    errors
  };
}

export function createSignerNode(config: RuntimeConfig): NodeWithEvents {
  return new BrowserBridgeNode(config);
}

export async function connectSignerNode(node: NodeWithEvents) {
  if (!isBrowserBridgeNode(node)) {
    throw new Error('Unsupported signer node implementation');
  }
  await node.connect();
}

export async function startSignerNode(config: RuntimeConfig) {
  const node = createSignerNode(config);
  await connectSignerNode(node);
  return node;
}

export function stopSignerNode(node: NodeWithEvents | null) {
  if (!node || !isBrowserBridgeNode(node)) return;
  void node.shutdown();
}

export async function refreshPeerStatuses(
  node: NodeWithEvents,
  peers: PeerPolicy[]
): Promise<PeerPolicy[]> {
  if (!isBrowserBridgeNode(node)) return peers;

  try {
    return await node.fetchPeers(peers);
  } catch (error) {
    console.warn('[RefreshPeers] Failed to refresh peer status', error);
    return peers;
  }
}

export async function pingSinglePeer(node: NodeWithEvents, pubkey: string): Promise<PingResult> {
  if (!isBrowserBridgeNode(node)) {
    return { success: false, error: 'Unsupported signer node implementation' };
  }

  try {
    return await node.pingPeer(pubkey);
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, 'Ping failed')
    };
  }
}

export async function setPeerPolicy(
  node: NodeWithEvents,
  pubkey: string,
  patch: PeerPolicyPatch
): Promise<void> {
  if (!isBrowserBridgeNode(node)) {
    throw new Error('Unsupported signer node implementation');
  }
  await node.updatePeerPolicy(pubkey, patch);
}

export function detachEvent(
  node: NodeWithEvents,
  event: string,
  handler: (...args: unknown[]) => void
) {
  try {
    if (typeof node.off === 'function') {
      node.off(event, handler);
    } else if (typeof node.removeListener === 'function') {
      node.removeListener(event, handler);
    }
  } catch (error) {
    console.warn(`Failed to detach event ${event}`, error);
  }
}
