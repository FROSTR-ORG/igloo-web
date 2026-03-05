import { bech32m } from '@scure/base';
import { getPublicKey } from 'nostr-tools';
import { secp256k1 } from '@noble/curves/secp256k1.js';

import type { GroupPackageWire, OnboardFixture } from './types';

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

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function u16be(value: number): Uint8Array {
  const out = new Uint8Array(2);
  out[0] = (value >>> 8) & 0xff;
  out[1] = value & 0xff;
  return out;
}

function u32be(value: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 0xff;
  out[1] = (value >>> 16) & 0xff;
  out[2] = (value >>> 8) & 0xff;
  out[3] = value & 0xff;
  return out;
}

function encodeOnboardingPackage(
  shareIdx: number,
  shareSecretHex32: string,
  peerXonlyHex32: string,
  relays: string[]
): string {
  const relayBytes = relays.map((relay) => new TextEncoder().encode(relay));
  const totalRelayLen = relayBytes.reduce((sum, item) => sum + 2 + item.length, 0);
  const payload = new Uint8Array(4 + 32 + 32 + 2 + totalRelayLen);

  let offset = 0;
  payload.set(u32be(shareIdx), offset);
  offset += 4;
  payload.set(hexToBytes(shareSecretHex32), offset);
  offset += 32;
  payload.set(hexToBytes(peerXonlyHex32), offset);
  offset += 32;
  payload.set(u16be(relays.length), offset);
  offset += 2;

  for (const relay of relayBytes) {
    payload.set(u16be(relay.length), offset);
    offset += 2;
    payload.set(relay, offset);
    offset += relay.length;
  }

  return bech32m.encode('bfonboard', bech32m.toWords(payload), 4096);
}

function compressed33FromSecret(secretHex32: string): string {
  return bytesToHex(secp256k1.getPublicKey(hexToBytes(secretHex32), true)).toLowerCase();
}

const DEFAULT_ACTOR_SECRET = '11'.repeat(32);
const DEFAULT_SHARE_SECRET = '22'.repeat(32);

export function createOnboardFixture(params: {
  relayUrl: string;
  eventKind?: number;
  shareIdx?: number;
  actorSecretHex32?: string;
  shareSecretHex32?: string;
}): OnboardFixture {
  const eventKind = params.eventKind ?? 20_000;
  const shareIdx = params.shareIdx ?? 2;
  const actorSecretHex32 = (params.actorSecretHex32 ?? DEFAULT_ACTOR_SECRET).toLowerCase();
  const shareSecretHex32 = (params.shareSecretHex32 ?? DEFAULT_SHARE_SECRET).toLowerCase();

  const actorPubkeyXonly = getPublicKey(actorSecretHex32).toLowerCase();
  const sharePubkeyXonly = getPublicKey(shareSecretHex32).toLowerCase();
  const actorPubkey33 = compressed33FromSecret(actorSecretHex32);
  const sharePubkey33 = compressed33FromSecret(shareSecretHex32);

  const group: GroupPackageWire = {
    group_pk: actorPubkey33,
    threshold: 2,
    members: [
      {
        idx: 1,
        pubkey: actorPubkey33
      },
      {
        idx: shareIdx,
        pubkey: sharePubkey33
      }
    ]
  };

  const onboardingPackage = encodeOnboardingPackage(
    shareIdx,
    shareSecretHex32,
    actorPubkeyXonly,
    [params.relayUrl]
  );

  return {
    relayUrl: params.relayUrl,
    eventKind,
    onboardingPackage,
    actorSecretHex32,
    actorPubkeyXonly,
    actorPubkey33,
    shareSecretHex32,
    sharePubkeyXonly,
    sharePubkey33,
    shareIdx,
    group
  };
}
