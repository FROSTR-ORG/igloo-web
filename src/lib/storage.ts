import { decryptBundle, encryptBundle, type EncryptedBundle } from './crypto';
import { normalizeRelays } from './igloo';

export type StoredShare = {
  group: string;
  share: string;
  relays: string[];
  keysetName?: string;
};

export type StoredPeerPolicy = {
  pubkey: string;
  send: boolean;
  receive: boolean;
};

const STORAGE_KEY = 'igloo.vault';
const POLICIES_KEY = 'igloo.policies';

export function hasStoredShare(): boolean {
  return !!localStorage.getItem(STORAGE_KEY);
}

export async function saveStoredShare(password: string, data: StoredShare): Promise<void> {
  const { relays } = normalizeRelays(data.relays);
  const bundle = await encryptBundle(password, { ...data, relays });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
}

export async function loadStoredShare(password: string): Promise<StoredShare> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('No saved share');
  const bundle = JSON.parse(raw) as EncryptedBundle;
  const payload = await decryptBundle<StoredShare>(password, bundle);
  const { relays } = normalizeRelays(payload.relays ?? []);
  return { ...payload, relays };
}

export function clearStoredShare() {
  localStorage.removeItem(STORAGE_KEY);
}

// Peer policies (not encrypted - just pubkey + allow/deny flags)
export function loadPeerPolicies(): StoredPeerPolicy[] {
  try {
    const raw = localStorage.getItem(POLICIES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredPeerPolicy[];
  } catch {
    return [];
  }
}

export function savePeerPolicies(policies: StoredPeerPolicy[]): void {
  localStorage.setItem(POLICIES_KEY, JSON.stringify(policies));
}

export function clearPeerPolicies(): void {
  localStorage.removeItem(POLICIES_KEY);
}
