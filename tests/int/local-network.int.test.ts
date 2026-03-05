import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { finalizeEvent, nip44 } from 'nostr-tools';

import { createOnboardFixture } from '../support/onboard-fixture';
import { LocalNostrRelay } from '../support/local-relay';
import { PeerActor } from '../support/peer-actor';
import type { BridgeEnvelopeWire, NostrEventWire } from '../support/types';

function randomPort(): number {
  return 15000 + Math.floor(Math.random() * 10000);
}

describe('local relay + peer actor integration', () => {
  const port = randomPort();
  const relay = new LocalNostrRelay(port);
  const fixture = createOnboardFixture({
    relayUrl: relay.url(),
    eventKind: 20_000
  });
  const actor = new PeerActor({
    relayUrl: fixture.relayUrl,
    eventKind: fixture.eventKind,
    actorSecretHex32: fixture.actorSecretHex32,
    group: fixture.group
  });

  let socket: WebSocket;
  const requesterSecret = hexToBytes(fixture.shareSecretHex32);
  const pending = new Map<string, (value: BridgeEnvelopeWire) => void>();
  const subId = `int-${Math.random().toString(16).slice(2)}`;

  beforeAll(async () => {
    await relay.start();
    await actor.start();

    socket = new WebSocket(fixture.relayUrl);
    await new Promise<void>((resolve, reject) => {
      socket.on('open', () => resolve());
      socket.on('error', reject);
    });

    socket.send(
      JSON.stringify([
        'REQ',
        subId,
        { kinds: [fixture.eventKind], authors: [fixture.actorPubkeyXonly], since: Math.floor(Date.now() / 1000) - 5 }
      ])
    );

    socket.on('message', (raw) => {
      const packet = JSON.parse(raw.toString()) as unknown;
      if (!Array.isArray(packet) || packet[0] !== 'EVENT') return;
      const event = packet[2] as NostrEventWire;
      try {
        const key = nip44.v2.utils.getConversationKey(requesterSecret, event.pubkey.toLowerCase());
        const plaintext = nip44.v2.decrypt(event.content, key);
        const envelope = JSON.parse(plaintext) as BridgeEnvelopeWire;
        const resolver = pending.get(envelope.request_id);
        if (!resolver) return;
        pending.delete(envelope.request_id);
        resolver(envelope);
      } catch {
        // Ignore unrelated event payloads.
      }
    });
  });

  afterAll(async () => {
    socket.send(JSON.stringify(['CLOSE', subId]));
    socket.close();
    await actor.stop();
    await relay.stop();
  });

  function sendRequest(envelope: BridgeEnvelopeWire): Promise<BridgeEnvelopeWire> {
    return new Promise((resolve) => {
      pending.set(envelope.request_id, resolve);
      const key = nip44.v2.utils.getConversationKey(requesterSecret, fixture.actorPubkeyXonly);
      const event = finalizeEvent(
        {
          kind: fixture.eventKind,
          tags: [],
          content: nip44.v2.encrypt(JSON.stringify(envelope), key),
          created_at: Math.floor(Date.now() / 1000)
        },
        requesterSecret
      );
      socket.send(JSON.stringify(['EVENT', event]));
    });
  }

  it('responds to onboard and ping requests', async () => {
    const onboardReqId = `req-${Date.now()}-onboard`;
    const onboardResponse = await sendRequest({
      request_id: onboardReqId,
      sent_at: Math.floor(Date.now() / 1000),
      payload: {
        type: 'OnboardRequest',
        data: { share_pk: fixture.sharePubkey33, idx: fixture.shareIdx }
      }
    });

    expect(onboardResponse.payload.type).toBe('OnboardResponse');
    const data = onboardResponse.payload.data as { group?: { members?: Array<{ pubkey: string }> } };
    expect(data.group?.members?.some((m) => m.pubkey.toLowerCase() === fixture.sharePubkey33)).toBe(true);

    const pingReqId = `req-${Date.now()}-ping`;
    const pingResponse = await sendRequest({
      request_id: pingReqId,
      sent_at: Math.floor(Date.now() / 1000),
      payload: {
        type: 'PingRequest',
        data: { version: 1, nonces: [], policy_profile: null }
      }
    });

    expect(pingResponse.payload.type).toBe('PingResponse');
  });
});

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
