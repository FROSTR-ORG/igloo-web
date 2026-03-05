import WebSocket from 'ws';
import { finalizeEvent, getPublicKey, nip44 } from 'nostr-tools';

import type { BridgeEnvelopeWire, GroupPackageWire, NostrEventWire } from './types';

type PeerActorConfig = {
  relayUrl: string;
  eventKind: number;
  actorSecretHex32: string;
  group: GroupPackageWire;
};

export class PeerActor {
  private socket: WebSocket | null = null;
  private readonly subId = `actor-${Math.random().toString(16).slice(2)}`;
  private readonly actorPubkeyXonly: string;
  private readonly actorSecretBytes: Uint8Array;

  constructor(private readonly cfg: PeerActorConfig) {
    this.actorSecretBytes = hexToBytes(cfg.actorSecretHex32);
    this.actorPubkeyXonly = getPublicKey(cfg.actorSecretHex32).toLowerCase();
  }

  pubkey(): string {
    return this.actorPubkeyXonly;
  }

  async start(): Promise<void> {
    if (this.socket) return;
    const socket = new WebSocket(this.cfg.relayUrl);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      socket.on('open', () => resolve());
      socket.on('error', reject);
    });

    socket.on('message', (raw) => {
      this.handleRelayMessage(raw.toString());
    });

    socket.send(
      JSON.stringify([
        'REQ',
        this.subId,
        {
          kinds: [this.cfg.eventKind]
        }
      ])
    );
  }

  async stop(): Promise<void> {
    if (!this.socket) return;
    this.socket.send(JSON.stringify(['CLOSE', this.subId]));
    this.socket.close();
    this.socket = null;
  }

  private handleRelayMessage(raw: string): void {
    const packet = JSON.parse(raw) as unknown;
    if (!Array.isArray(packet)) return;
    if (packet[0] !== 'EVENT') return;

    const event = packet[2] as NostrEventWire | undefined;
    if (!event) return;
    if (event.pubkey.toLowerCase() === this.actorPubkeyXonly) return;
    if (event.kind !== this.cfg.eventKind) return;

    try {
      const conversationKey = nip44.v2.utils.getConversationKey(
        this.actorSecretBytes,
        event.pubkey.toLowerCase()
      );
      const plaintext = nip44.v2.decrypt(normalizeNip44ForJs(event.content), conversationKey);
      const envelope = JSON.parse(plaintext) as BridgeEnvelopeWire;
      if (!envelope?.payload?.type) return;

      if (envelope.payload.type === 'OnboardRequest') {
        this.publishResponse(event.pubkey, conversationKey, {
          request_id: envelope.request_id,
          sent_at: Math.floor(Date.now() / 1000),
          payload: {
            type: 'OnboardResponse',
            data: {
              group: this.cfg.group,
              nonces: []
            }
          }
        });
      }

      if (envelope.payload.type === 'PingRequest') {
        this.publishResponse(event.pubkey, conversationKey, {
          request_id: envelope.request_id,
          sent_at: Math.floor(Date.now() / 1000),
          payload: {
            type: 'PingResponse',
            data: envelope.payload.data
          }
        });
      }
    } catch {
      // Ignore events not intended for this actor.
    }
  }

  private publishResponse(
    recipientPubkey: string,
    conversationKey: Uint8Array,
    envelope: BridgeEnvelopeWire
  ): void {
    if (!this.socket) return;
    const content = normalizeNip44ForRust(
      nip44.v2.encrypt(JSON.stringify(envelope), conversationKey)
    );
    const event = finalizeEvent(
      {
        kind: this.cfg.eventKind,
        tags: [],
        content,
        created_at: Math.floor(Date.now() / 1000)
      },
      this.actorSecretBytes
    );

    this.socket.send(JSON.stringify(['EVENT', event]));
  }
}

function normalizeNip44ForJs(value: string): string {
  const mod = value.length % 4;
  return mod === 0 ? value : `${value}${'='.repeat(4 - mod)}`;
}

function normalizeNip44ForRust(value: string): string {
  return value.replace(/=+$/g, '');
}

function hexToBytes(value: string): Uint8Array {
  const clean = value.toLowerCase();
  if (clean.length % 2 !== 0) {
    throw new Error('hex string must have even length');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
