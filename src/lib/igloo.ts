import {
  createAndConnectNode,
  cleanupBifrostNode,
  decodeGroup,
  decodeShare,
  extractSelfPubkeyFromCredentials,
  normalizePubkey,
  pingPeer,
  pingPeersAdvanced,
  type BifrostNode,
  type GroupPackage,
  type SharePackage,
  validateGroup,
  validateRelayList,
  validateShare
} from '@frostr/igloo-core';

import type { PeerPolicy } from '@/components/ui/peer-list';

export const DEFAULT_RELAYS = ['wss://relay.primal.net', 'wss://relay.damus.io'];

export type CredentialDiagnostics = {
  group?: GroupPackage;
  share?: SharePackage;
  summary?: {
    idx: number;
    threshold?: number;
    totalMembers?: number;
    pubkey?: string;
  } | null;
};

export type ValidationResult = {
  isValid: boolean;
  error?: string;
  decoded?: GroupPackage | SharePackage;
};

const ensureArray = (value: string[]) => Array.from(new Set(value.map((relay) => relay.replace(/\/$/, ''))));

export function validateGroupCredential(value: string): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Group credential is required' };
  }

  const validation = validateGroup(trimmed);
  if (!validation.isValid) {
    return { isValid: false, error: validation.message || 'Invalid group credential' };
  }

  try {
    const decoded = decodeGroup(trimmed);
    return { isValid: true, decoded };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Failed to decode group'
    };
  }
}

export function validateShareCredential(value: string, group?: GroupPackage): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Share credential is required' };
  }

  const validation = validateShare(trimmed);
  if (!validation.isValid) {
    return { isValid: false, error: validation.message || 'Invalid share credential' };
  }

  try {
    const decoded = decodeShare(trimmed);
    if (group && !shareBelongsToGroup(decoded, group)) {
      return { isValid: false, error: 'Share does not belong to this group' };
    }

    return { isValid: true, decoded };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Failed to decode share'
    };
  }
}

const shareBelongsToGroup = (share: SharePackage, group: GroupPackage) => {
  if (!group?.commits || !Array.isArray(group.commits)) return false;
  return group.commits.some((commit) => commit.idx === share.idx);
};

export function getCredentialDiagnostics(group?: string, share?: string): CredentialDiagnostics {
  try {
    if (!group || !share) return {};
    const decodedGroup = decodeGroup(group);
    const decodedShare = decodeShare(share);
    const commit = decodedGroup.commits?.find((entry) => entry.idx === decodedShare.idx);
    return {
      group: decodedGroup,
      share: decodedShare,
      summary: {
        idx: decodedShare.idx,
        threshold: decodedGroup.threshold,
        totalMembers: decodedGroup.commits?.length,
        pubkey: commit?.pubkey
      }
    };
  } catch {
    return {};
  }
}

export function normalizeRelays(relays: string[]): { relays: string[]; errors: string[] } {
  const sanitized = relays.filter((relay) => typeof relay === 'string' && relay.trim().length > 0);
  const base = sanitized.length ? sanitized : DEFAULT_RELAYS;
  try {
    const result = validateRelayList(base);
    const normalized = result.normalizedRelays?.length ? result.normalizedRelays : result.validRelays?.length ? result.validRelays : base;
    const unique = ensureArray(normalized);
    return { relays: unique.length ? unique : DEFAULT_RELAYS, errors: result.errors ?? [] };
  } catch (error) {
    return {
      relays: ensureArray(base.length ? base : DEFAULT_RELAYS),
      errors: [error instanceof Error ? error.message : 'Relay validation failed']
    };
  }
}

export async function startSignerNode(config: { group: string; share: string; relays: string[] }) {
  return createAndConnectNode(config, {
    enableLogging: true,
    logLevel: 'info'
  });
}

export function stopSignerNode(node: BifrostNode | null) {
  if (!node) return;
  try {
    cleanupBifrostNode(node);
  } catch (error) {
    console.warn('Failed to cleanup node', error);
  }
}

export function buildPeerList(group: string, share: string): PeerPolicy[] {
  try {
    const peers = extractPeerPubkeys(group, share);
    return peers.map((pubkey, index) => ({
      alias: `Peer ${index + 1}`,
      pubkey,
      send: true,
      receive: true,
      state: 'offline'
    }));
  } catch (error) {
    console.warn('Failed to extract peers', error);
    return [];
  }
}

export async function refreshPeerStatuses(node: BifrostNode, group: string, share: string, peers: PeerPolicy[]): Promise<PeerPolicy[]> {
  try {
    const peerList = peers.length ? peers : buildPeerList(group, share);
    // Normalize pubkeys (remove 02/03 prefix) to match node's internal peer format
    const pubkeys = peerList.map((peer) => safeNormalize(peer.pubkey));
    console.log('[RefreshPeers] Pinging pubkeys (normalized):', pubkeys);
    if (!pubkeys.length) return peerList;

    const results = await pingPeersAdvanced(node, pubkeys, { timeout: 10000 });
    console.log('[RefreshPeers] Results:', results);

    return peerList.map((peer) => {
      const normalizedPeer = safeNormalize(peer.pubkey);
      const status = results.find((entry) => safeNormalize(entry.pubkey) === normalizedPeer);
      if (!status) return peer;
      return {
        ...peer,
        state: status.success ? 'online' : 'offline'
      };
    });
  } catch (error) {
    console.warn('[RefreshPeers] Failed to refresh peer status', error);
    return peers;
  }
}

export type PingResult = {
  success: boolean;
  latency?: number;
  error?: string;
};

export async function pingSinglePeer(node: BifrostNode, pubkey: string): Promise<PingResult> {
  try {
    // Normalize pubkey (remove 02/03 prefix) to match node's internal peer format
    const normalized = safeNormalize(pubkey);
    console.log('[Ping] Attempting ping to:', { original: pubkey, normalized });

    const result = await pingPeer(node, normalized, { timeout: 10000 });
    console.log('[Ping] Result:', result);

    return {
      success: result.success,
      latency: result.latency,
      error: result.error
    };
  } catch (error) {
    console.error('[Ping] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Ping failed'
    };
  }
}

const safeNormalize = (pubkey: string) => {
  try {
    return normalizePubkey(pubkey);
  } catch {
    return pubkey;
  }
};

export type NodeWithEvents = BifrostNode & {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export function detachEvent(node: NodeWithEvents, event: string, handler: (...args: unknown[]) => void) {
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

function extractPeerPubkeys(groupCredential: string, shareCredential: string): string[] {
  try {
    const group = decodeGroup(groupCredential);
    const groupAny = group as GroupPackage & {
      participants?: string[];
      members?: Array<string | { pubkey?: string; pub?: string }>;
    };

    const { pubkey: selfPubkeyRaw } = extractSelfPubkeyFromCredentials(groupCredential, shareCredential, {
      normalize: true,
      suppressWarnings: true
    });
    const selfPubkey = selfPubkeyRaw ? safeNormalize(selfPubkeyRaw) : null;

    let allPubkeys: string[] = [];

    if (Array.isArray(group.commits)) {
      const commitPubkeys = group.commits
        .map((commit: any) => commit?.pubkey)
        .filter((pubkey: unknown): pubkey is string => typeof pubkey === 'string' && pubkey.length > 0);
      allPubkeys.push(...commitPubkeys);
    }

    if (!allPubkeys.length && Array.isArray(groupAny.participants)) {
      const participantPubkeys = groupAny.participants.filter(
        (pubkey: unknown): pubkey is string => typeof pubkey === 'string' && pubkey.length > 0
      );
      allPubkeys.push(...participantPubkeys);
    }

    if (!allPubkeys.length && Array.isArray(groupAny.members)) {
      const memberPubkeys = groupAny.members
        .map((member) => {
          if (typeof member === 'string') return member;
          if (member?.pubkey) return member.pubkey;
          if (member?.pub) return member.pub;
          return null;
        })
        .filter((pubkey: unknown): pubkey is string => typeof pubkey === 'string' && pubkey.length > 0);
      allPubkeys.push(...memberPubkeys);
    }

    if (!allPubkeys.length) {
      return [];
    }

    const seen = new Set<string>();
    const peers: string[] = [];

    for (const pubkey of allPubkeys) {
      const normalized = safeNormalize(pubkey);
      if (selfPubkey && normalized === selfPubkey) continue;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        peers.push(pubkey);
      }
    }

    return peers;
  } catch (error) {
    console.warn('Failed to derive peer pubkeys from credentials', error);
    return [];
  }
}
