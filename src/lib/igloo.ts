import {
  createAndConnectNode,
  cleanupBifrostNode,
  decodeGroup,
  decodeShare,
  extractSelfPubkeyFromCredentials,
  normalizePubkey,
  pingPeer,
  pingPeersAdvanced,
  createBifrostNode,
  connectNode,
  type BifrostNode,
  type GroupPackage,
  type SharePackage,
  validateGroup,
  validateRelayList,
  validateShare
} from '@frostr/igloo-core';
import { finalize_message } from '@cmdcode/nostr-p2p/lib';

import type { PeerPolicy } from '@/components/ui/peer-list';

/**
 * Local interface documenting the BifrostNode internals we access.
 * @frostr/bifrost doesn't export these types, so we define them here
 * to make our assumptions explicit. This doesn't provide runtime safety
 * but documents what we expect from the node object.
 *
 * If bifrost changes its internal structure, TypeScript won't catch it,
 * but at least our assumptions are documented in one place.
 */
interface BifrostNodeInternals {
  pubkey: string;
  peers: Array<{ pubkey: string; policy?: { send?: boolean; recv?: boolean } }>;
  client: {
    publish: (envelope: unknown, pubkey: string) => Promise<{ ok: boolean; reason?: string; err?: string }>;
  };
}

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

/**
 * Creates a signer node WITHOUT connecting. Use connectSignerNode() to connect.
 * This allows attaching message handlers before the node goes live.
 */
export function createSignerNode(config: { group: string; share: string; relays: string[] }) {
  return createBifrostNode(config, {
    enableLogging: true,
    logLevel: 'info'
  });
}

/**
 * Connects a previously created signer node.
 */
export async function connectSignerNode(node: BifrostNode) {
  return connectNode(node);
}

/**
 * Publishes echo to SELF using client.publish() (fire-and-forget).
 * This is different from node.req.echo() which uses client.request().
 *
 * igloo-desktop's awaitShareEcho uses the SAME share credentials,
 * so it has the SAME pubkey and can decrypt messages to that pubkey.
 *
 * Key insight: client.publish() broadcasts work, client.request() doesn't
 * for cross-device echo even when both nodes have the same pubkey.
 *
 * NOTE: Casts to BifrostNodeInternals because @frostr/bifrost doesn't export
 * typed interfaces. See BifrostNodeInternals definition for documented assumptions.
 */
export async function publishEchoToSelf(
  node: BifrostNode,
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void
): Promise<boolean> {
  // Cast to our local interface that documents expected internal structure
  const nodeInternal = node as unknown as BifrostNodeInternals;
  const selfPubkey = nodeInternal.pubkey;

  if (!selfPubkey) {
    logger?.('warn', 'Cannot publish echo: node pubkey not available');
    return false;
  }

  try {
    // Create finalized message envelope (same pattern as broadcastEchoToPeers)
    const envelope = finalize_message({
      data: 'echo',
      id: generateEchoChallenge(16),
      tag: '/echo/req'
    });

    logger?.('debug', 'Publishing echo to self', { pubkey: selfPubkey.substring(0, 16) + '...' });

    // Publish to our OWN pubkey using client.publish() (not client.request())
    const result = await nodeInternal.client.publish(envelope, selfPubkey);

    if (result?.ok) {
      logger?.('info', 'Echo published to self successfully');
      return true;
    } else {
      const reason = result?.reason || result?.err || 'not ok';
      logger?.('debug', 'Echo publish returned not-ok', { reason });
      return false;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    // INTENTIONAL: Treat "relay connection closed" as success.
    // This error is thrown during cleanup AFTER the publish completes successfully.
    // The message WAS sent; the relay just closed during teardown.
    // This is known nostr-p2p behavior, not a failure case.
    if (msg.toLowerCase().includes('relay connection closed')) {
      logger?.('info', 'Echo published (relay closed after send)');
      return true;
    }

    logger?.('warn', 'Echo publish failed', msg);
    return false;
  }
}

/**
 * Broadcasts echo to all PEERS (not self).
 * This is what igloo-desktop's awaitShareEcho needs - it listens for /echo/req
 * from a specific peer pubkey. The message must be encrypted TO the peer's pubkey
 * so they can decrypt and see it.
 *
 * Uses finalize_message + client.publish() pattern from igloo-server's broadcastShareEcho.
 * This sends the message encrypted to EACH peer's pubkey, so they can decrypt it.
 *
 * NOTE: Casts to BifrostNodeInternals because @frostr/bifrost doesn't export
 * typed interfaces. See BifrostNodeInternals definition for documented assumptions.
 */
export async function broadcastEchoToPeers(
  node: BifrostNode,
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void
): Promise<{ success: number; total: number }> {
  // Cast to our local interface that documents expected internal structure
  const nodeInternal = node as unknown as BifrostNodeInternals;
  const peers = nodeInternal.peers;

  if (!Array.isArray(peers) || peers.length === 0) {
    logger?.('warn', 'No peers to broadcast echo to');
    return { success: 0, total: 0 };
  }

  let successCount = 0;

  logger?.('debug', 'Broadcasting echo to peers', { count: peers.length });

  // Send echo to each peer sequentially (parallel can overwhelm relays)
  for (const peer of peers) {
    const pubkey = peer?.pubkey;
    if (!pubkey) continue;

    try {
      // Create finalized message envelope (like igloo-server's broadcastShareEcho does)
      // Use 'echo' literal - igloo-core's awaitShareEcho accepts: data === 'echo' || isEvenLengthHex(data)
      const envelope = finalize_message({
        data: 'echo',
        id: generateEchoChallenge(16),
        tag: '/echo/req'
      });

      // Publish to this peer's pubkey (so THEY can decrypt)
      const result = await nodeInternal.client.publish(envelope, pubkey);

      if (result?.ok) {
        successCount++;
        logger?.('debug', `Echo published to peer`, { pubkey: pubkey.substring(0, 16) + '...' });
      } else {
        // Log the reason if available
        const reason = result?.reason || result?.err || 'not ok';
        logger?.('debug', `Echo publish returned not-ok`, { pubkey: pubkey.substring(0, 16) + '...', reason });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      // INTENTIONAL: Treat "relay connection closed" as success.
      // Error thrown during cleanup AFTER publish completes. Known nostr-p2p behavior.
      if (msg.toLowerCase().includes('relay connection closed')) {
        successCount++;
        logger?.('debug', `Echo published (relay closed)`, { pubkey: pubkey.substring(0, 16) + '...' });
        continue;
      }

      logger?.('warn', `Echo to peer failed`, { pubkey: pubkey.substring(0, 16) + '...', error: msg });
    }
  }

  logger?.('info', `Echo broadcast to ${successCount}/${peers.length} peers`);
  return { success: successCount, total: peers.length };
}

export function stopSignerNode(node: BifrostNode | null) {
  if (!node) return;

  // Temporarily suppress the expected igloo-core warning about removeAllListeners
  // This warning is harmless - the BifrostNode EventEmitter doesn't expose
  // removeAllListeners, but manual cleanup via off/removeListener still works
  const originalWarn = console.warn;
  console.warn = (message: unknown, ...args: unknown[]) => {
    if (typeof message === 'string' && message.includes('removeAllListeners not available')) {
      return; // Skip this expected warning
    }
    originalWarn(message, ...args);
  };

  try {
    cleanupBifrostNode(node);
  } catch (error) {
    originalWarn('Failed to cleanup node', error);
  } finally {
    console.warn = originalWarn;
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

function getSecureCrypto(): Crypto {
  const globalCrypto = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;
  if (globalCrypto?.getRandomValues) {
    return globalCrypto as Crypto;
  }

  const nodeWebcrypto = tryGetNodeWebcrypto();
  if (nodeWebcrypto?.getRandomValues) {
    return nodeWebcrypto;
  }

  throw new Error('Secure randomness unavailable: crypto.getRandomValues is required to generate echo challenges.');
}

function tryGetNodeWebcrypto(): Crypto | undefined {
  try {
    // Use eval to avoid bundlers eagerly pulling in the Node crypto module in browsers.
    const nodeRequire = (0, eval)('require') as undefined | ((id: string) => any);
    if (typeof nodeRequire === 'function') {
      const { webcrypto } = nodeRequire('crypto') ?? {};
      if (webcrypto?.getRandomValues) return webcrypto as Crypto;
    }
  } catch {
    // ignore; caller will throw a clear error when no secure RNG is available
  }
  return undefined;
}

function generateEchoChallenge(byteLength = 32): string {
  const buffer = new Uint8Array(byteLength);
  const secureCrypto = getSecureCrypto();
  secureCrypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Responds to an incoming /echo/req message by publishing an /echo/res with peer policy.
 *
 * NOTE: Casts to BifrostNodeInternals because @frostr/bifrost doesn't export
 * typed interfaces. See BifrostNodeInternals definition for documented assumptions.
 * Message shape (`msg`) is also untyped from bifrost event handlers.
 *
 * @param node - BifrostNode instance
 * @param msg - Message from 'message' event handler (untyped from bifrost)
 * @param logger - Optional logging callback
 */
export async function respondToEchoRequest(
  node: BifrostNode,
  msg: any, // Message shape not exported by @frostr/bifrost
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void
): Promise<boolean> {
  try {
    const requesterPubkeyRaw = typeof msg?.env?.pubkey === 'string' ? msg.env.pubkey.trim() : '';
    if (!requesterPubkeyRaw) {
      throw new Error('Echo request missing requester pubkey');
    }

    const normalizedRequester = safeNormalize(requesterPubkeyRaw);

    // Cast to our local interface that documents expected internal structure
    const nodeInternal = node as unknown as BifrostNodeInternals;
    const peers = nodeInternal.peers;

    // Find the peer that sent this echo request
    let peerPolicy: { send?: boolean; recv?: boolean } | null = null;
    if (Array.isArray(peers)) {
      const match = peers.find((entry) => {
        const entryPub = typeof entry?.pubkey === 'string' ? entry.pubkey : null;
        if (!entryPub) return false;
        return safeNormalize(entryPub) === normalizedRequester;
      });
      if (match) {
        peerPolicy = match?.policy ?? { send: true, recv: true };
      }
    }

    if (!peerPolicy) {
      logger?.('info', 'Ignoring echo request from unknown peer', { pubkey: requesterPubkeyRaw });
      return false;
    }

    const echoId =
      typeof msg?.id === 'string' && msg.id.trim().length > 0 ? msg.id.trim() : generateEchoChallenge(16);

    const envelope = finalize_message({
      data: JSON.stringify(peerPolicy),
      id: echoId,
      tag: '/echo/res'
    });

    const publishResult = await nodeInternal.client.publish(envelope, requesterPubkeyRaw);
    if (!publishResult?.ok) {
      const reason = publishResult?.reason ?? publishResult?.err ?? 'unknown publish error';
      throw new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
    }

    logger?.('info', 'Echo response published', { pubkey: requesterPubkeyRaw, echoId });
    return true;
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);

    // INTENTIONAL: Treat "relay connection closed by us" as success.
    // This error is thrown during connection cleanup AFTER the publish completes.
    // The message WAS sent successfully; the relay just closed during teardown.
    // Without this branch, legitimate successful publishes would be incorrectly
    // reported as failures. This is a known nostr-p2p behavior, not a bug.
    if (details.toLowerCase().includes('relay connection closed by us')) {
      logger?.('info', 'Echo response sent (relay closed after publish)', details);
      return true;
    }

    logger?.('warn', 'Failed to publish echo response', details);
    return false;
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
