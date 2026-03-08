import { normalizeRelays } from './igloo';

export type StoredProfile = {
  relays: string[];
  keysetName?: string;
  groupPublicKey?: string;
  publicKey?: string;
  peerPubkey?: string;
};

export type StoredPeerPolicy = {
  pubkey: string;
  send: boolean;
  receive: boolean;
};

const STORAGE_KEY = 'igloo.v2.profile';
const POLICIES_KEY = 'igloo.policies';
export const RUNTIME_SNAPSHOT_LOCAL_STORAGE_KEY = 'igloo.runtimeSnapshot';

export function hasStoredProfile(): boolean {
  return !!localStorage.getItem(STORAGE_KEY);
}

export function saveStoredProfile(data: StoredProfile): void {
  const { relays } = normalizeRelays(data.relays);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, relays }));
}

export function loadStoredProfile(): StoredProfile {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('No saved profile');
  const payload = JSON.parse(raw) as StoredProfile;
  const { relays } = normalizeRelays(payload.relays ?? []);
  return { ...payload, relays };
}

export function clearStoredProfile() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(RUNTIME_SNAPSHOT_LOCAL_STORAGE_KEY);
}

export function saveRuntimeSnapshot(snapshotJson: string): void {
  localStorage.setItem(RUNTIME_SNAPSHOT_LOCAL_STORAGE_KEY, snapshotJson);
}

export function loadRuntimeSnapshot(): string | null {
  return localStorage.getItem(RUNTIME_SNAPSHOT_LOCAL_STORAGE_KEY);
}

export function clearRuntimeSnapshot(): void {
  localStorage.removeItem(RUNTIME_SNAPSHOT_LOCAL_STORAGE_KEY);
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
