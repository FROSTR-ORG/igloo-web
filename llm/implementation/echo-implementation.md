# Echo Implementation for Share Handoff

## Overview

When igloo-desktop passes a share to igloo-web via QR code, igloo-web must send an "echo" message to confirm the share is active. igloo-desktop's `awaitShareEcho` function listens for this echo to verify successful handoff before proceeding.

## Context

- **igloo-web**: React + Vite web app acting as a FROSTR signer
- **igloo-desktop**: Electron app that generates keysets and can pass shares to other devices
- **Core libs**: `@frostr/igloo-core` (node helpers), `@frostr/bifrost` (signing node), `@cmdcode/nostr-p2p` (nostr messaging)

## The Critical Insight

**Both igloo-web and igloo-desktop use the SAME share credentials**, which means:
- Both nodes have the **same pubkey** (derived from the share)
- Both nodes have the **same private key** (derived from the share)
- Messages encrypted TO that pubkey can be decrypted by EITHER node

This is why the echo works: igloo-web publishes to its own pubkey, and igloo-desktop (running `awaitShareEcho` with the same share) can decrypt and receive it.

## What Works vs What Doesn't

| Approach | Method | Result |
|----------|--------|--------|
| `client.publish(envelope, pubkey)` | Fire-and-forget broadcast | **WORKS** |
| `client.request(envelope, pubkey)` | Request/response pattern | **DOES NOT WORK** |
| `node.req.echo(challenge)` | Uses `client.request()` internally | **DOES NOT WORK** |

The key difference is routing behavior:
- `client.publish()` broadcasts via relay in a way that other nodes subscribed to that author receive the message
- `client.request()` has different internal routing that doesn't propagate to cross-device listeners

## Working Implementation

### File: `src/lib/igloo.ts`

```typescript
import { finalize_message } from '@cmdcode/nostr-p2p/lib';

/**
 * Publishes echo to SELF using client.publish() (fire-and-forget).
 * This is different from node.req.echo() which uses client.request().
 *
 * igloo-desktop's awaitShareEcho uses the SAME share credentials,
 * so it has the SAME pubkey and can decrypt messages to that pubkey.
 *
 * Key insight: client.publish() broadcasts work, client.request() doesn't
 * for cross-device echo even when both nodes have the same pubkey.
 */
export async function publishEchoToSelf(
  node: BifrostNode,
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void
): Promise<boolean> {
  const nodeAny = node as any;
  const selfPubkey = nodeAny.pubkey;

  if (!selfPubkey) {
    logger?.('warn', 'Cannot publish echo: node pubkey not available');
    return false;
  }

  try {
    // Create finalized message envelope
    // Data can be 'echo' literal or even-length hex string
    // igloo-core's awaitShareEcho accepts both: data === 'echo' || isEvenLengthHex(data)
    const envelope = finalize_message({
      data: 'echo',
      id: generateEchoChallenge(16),  // Random hex ID
      tag: '/echo/req'
    });

    logger?.('debug', 'Publishing echo to self', { pubkey: selfPubkey.substring(0, 16) + '...' });

    // Publish to our OWN pubkey using client.publish() (not client.request())
    const result = await nodeAny.client.publish(envelope, selfPubkey);

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

    // Relay close after publish is acceptable - message was sent
    if (msg.toLowerCase().includes('relay connection closed')) {
      logger?.('info', 'Echo published (relay closed after send)');
      return true;
    }

    logger?.('warn', 'Echo publish failed', msg);
    return false;
  }
}

function generateEchoChallenge(byteLength = 32): string {
  const buffer = new Uint8Array(byteLength);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
```

### File: `src/pages/Signer.tsx`

```typescript
import { publishEchoToSelf } from '@/lib/igloo';

// In handleStart, after node connects:
const echoLogger = (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => {
  const levelMap: Record<string, string> = { info: 'INFO', warn: 'WARN', debug: 'DEBUG', error: 'ERROR' };
  addLog(levelMap[level] || 'INFO', message, data);
};

publishEchoToSelf(node, echoLogger).then((success) => {
  if (success) {
    addLog('ECHO', 'Echo published to self to announce presence');
  }
}).catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown echo error';
  addLog('WARN', 'Echo error', message);
});
```

## Message Flow Diagram

```
┌─────────────────┐                              ┌─────────────────┐
│  igloo-desktop  │                              │   igloo-web     │
│                 │                              │                 │
│  1. Generate    │                              │                 │
│     keyset      │                              │                 │
│                 │                              │                 │
│  2. Show QR     │─────── QR code scan ────────▶│  3. Receive     │
│     (share +    │      (share credentials)     │     share       │
│      group)     │                              │                 │
│                 │                              │                 │
│  4. Call        │                              │  5. Create      │
│     awaitShare- │                              │     Bifrost     │
│     Echo()      │                              │     node with   │
│                 │                              │     same share  │
│     - Creates   │                              │                 │
│       temp node │                              │  6. Connect     │
│       with SAME │                              │     node        │
│       share     │                              │                 │
│                 │                              │  7. Call        │
│     - Listens   │                              │     publishEcho │
│       for       │                              │     ToSelf()    │
│       'message' │                              │                 │
│       event     │                              │     - finalize_ │
│                 │                              │       message() │
│                 │                              │                 │
│                 │           Relay              │     - client.   │
│                 │         ┌───────┐            │       publish() │
│                 │         │       │            │       to self   │
│                 │◀────────│ /echo │◀───────────│       pubkey    │
│                 │         │ /req  │            │                 │
│  8. 'message'   │         │       │            │                 │
│     event fires │         └───────┘            │                 │
│                 │                              │                 │
│  9. Check tag   │                              │                 │
│     === '/echo/ │                              │                 │
│     req'        │                              │                 │
│                 │                              │                 │
│  10. Check data │                              │                 │
│      === 'echo' │                              │                 │
│      OR isHex() │                              │                 │
│                 │                              │                 │
│  11. awaitShare │                              │                 │
│      Echo()     │                              │                 │
│      resolves   │                              │                 │
│      true!      │                              │                 │
└─────────────────┘                              └─────────────────┘
```

## How igloo-desktop's awaitShareEcho Works

From `@frostr/igloo-core/src/echo.ts`:

```javascript
export async function awaitShareEcho(
  share: string,
  group: string,
  relays: string[],
  options = {}
): Promise<boolean> {
  // Creates a temp node with the SAME share credentials
  const node = await createConnectedNode({ share, group, relays });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, options.timeout || 30000);

    // Listens on the generic 'message' event
    node.on('message', (msg) => {
      // Checks for /echo/req tag
      if (msg.tag === '/echo/req') {
        // Accepts 'echo' literal OR any even-length hex string
        if (msg.data === 'echo' || isEvenLengthHex(msg.data)) {
          clearTimeout(timeout);
          cleanup();
          resolve(true);
        }
      }
    });
  });
}
```

Key points:
- Uses the **same share credentials** as igloo-web
- Therefore has the **same pubkey** and can decrypt messages TO that pubkey
- Listens on generic `message` event, not a specific handler
- Accepts `data === 'echo'` OR any even-length hex string as valid echo data

## Why client.request() Doesn't Work

The bifrost library's `echo_request_api` (in `@frostr/bifrost/src/api/echo.ts`):

```javascript
async function create_echo_request(node, challenge) {
  // Uses client.request() - request/response pattern
  const res = await node.client.request({
    data: challenge,
    tag: '/echo/req'
  }, node.pubkey, {});

  if (!res.ok) throw new Error(res.reason);
  return res.inbox[0];
}
```

This uses `client.request()` which:
1. Sends the message
2. **Waits for a response** (the `/echo/res` message)
3. The internal routing differs from `client.publish()`

Even though the message is sent to the same pubkey, the cross-device node doesn't receive it via its `message` event listener when `client.request()` is used. Only `client.publish()` broadcasts in a way that triggers the listener.

## Why Broadcasting to Each Peer Separately Works (But Is Wrong)

We also implemented `broadcastEchoToPeers` which uses `client.publish()` to each peer's pubkey. This worked for OTHER peers but not for the share handoff because:

1. igloo-desktop's `awaitShareEcho` listens with a node that has the **share's pubkey**, not the peer pubkeys
2. Sending to peer pubkeys encrypts TO those pubkeys - the share node can't decrypt them
3. The solution is to publish to the **self pubkey** (which is the share's pubkey)

## Error Handling

The implementation handles common edge cases:

1. **Relay close after publish**: Treated as success - the message was sent before the relay closed
2. **Missing pubkey**: Returns false with warning log
3. **Publish rejection**: Returns false, logs the reason

## Files Modified

1. **`src/lib/igloo.ts`**
   - Added `publishEchoToSelf()` function
   - Uses `finalize_message` from `@cmdcode/nostr-p2p/lib`
   - Uses `client.publish()` to self pubkey

2. **`src/pages/Signer.tsx`**
   - Imports and calls `publishEchoToSelf()` after node connects
   - Logs echo status to the event log

## Dependencies

- `@cmdcode/nostr-p2p`: Provides `finalize_message()` for creating message envelopes
- `@frostr/bifrost`: Provides `BifrostNode` with `client.publish()` method
- `@frostr/igloo-core`: Provides node creation, but echo send is custom

## Testing

To verify echo is working:

1. In igloo-desktop: Generate a keyset and initiate share handoff (shows QR)
2. In igloo-web: Scan QR, enter credentials, start signer
3. In igloo-web logs: Should see "Echo published to self successfully" and "Echo published to self to announce presence"
4. In igloo-desktop: The `awaitShareEcho` should resolve, handoff completes

## Future Considerations

1. **Retry logic**: Currently echo is fire-and-forget. Could add retry with backoff if echo confirmation is critical.

2. **Bidirectional echo**: igloo-web could also run `awaitShareEcho` to confirm igloo-desktop received it (if igloo-desktop sends an echo back).

3. **Upstream fix**: If `@frostr/bifrost` is updated to make `node.req.echo()` use `client.publish()` internally, the custom implementation could be replaced.

4. **Echo response handling**: igloo-web also has `respondToEchoRequest()` to reply to incoming `/echo/req` messages from peers, maintaining compatibility with the full echo protocol.
