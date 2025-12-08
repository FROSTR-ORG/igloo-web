# Echo Debug Report (igloo-web / igloo-desktop)

## Goal
Ensure igloo-web sends a self-echo on first setup/start so igloo-desktop (or any peer) receives `/echo/req` and confirms the share.

## Current Symptoms
- igloo-web signer ready; pings to peers succeed.
- Echo attempts fire, but igloo-desktop never registers the echo.
- Benign “relay connection closed by us” traces appeared during echo send; now swallowed, but echo still ineffective.
- Occasional dev-server load errors (`@vite/client`, `@react-refresh`, `src/main.tsx`) seen in browser console; likely noise.

## Changes Attempted (this repo)
1) Swallow relay-close globally:
   - `src/main.tsx` `unhandledrejection` guard to prevent UI crash on nostr close error.
   - Treated relay-close as soft success inside echo send/cleanup paths.

2) Echo send/cleanup hardening (`src/lib/igloo.ts`):
   - `safeCloseNode` now fully swallows errors from `closeNode` (temp echo node teardown).
   - `sendEchoQuiet` treats relay-close during send/cleanup as success.
   - Removed echo handoff cache so echo is attempted every time signer mounts/starts (no “already sent” skip).

3) Echo-response handling in igloo-web:
   - Added `respondToEchoRequest` and wired in `Signer.tsx` to reply to inbound `/echo/req` with peer policy.

Build status: `npm run build` passes after each change.

## Why It Still Fails (observations)
- `/echo/req` arrives in igloo-web logs, but:
  - Temp echo sender still sees relay-close during teardown; suppressed but may mask real send failure.
  - No `/echo/res` observed on the receiving device → publish or filter path may be failing.
- Request path uses `node.client.request` (nostr-p2p). If subscription/publish rejected by relay policy, request never reaches peers; current soft-success handling may hide that.
- Peer filtering risk: BifrostNode filters by policy; if `node.peers` pubkeys don’t match requester format (prefix differences), responses may be dropped.
- Relay alignment: pings succeed, but echo request/subscribe may differ; common relay set not confirmed.

## Open Questions / Missing Data
- On igloo-desktop: do `/echo/req` or `/echo/res` appear in its logs?
- Exact relay list on both devices during echo attempt.
- Do both devices share the same relay for the echo temp node?
- Pubkey formats in `node.peers` vs incoming `msg.env.pubkey` on receiving side.

## Recommended Next Steps
1) Add targeted logging around echo send/receive:
   - Log relay list used for echo, request/response pubkeys, and publish receipt (acks/fails) inside `sendEchoQuiet`.
   - On receiving side, log when `/echo/handler/req` fires and whether peer lookup succeeds (compare against `node.peers`).

2) Force-strict failure on send:
   - Temporarily stop swallowing relay-close in the send path; surface actual publish response/ack lists to see if relays reject.

3) Verify peer filtering:
   - Log `node.peers` pubkeys and the incoming `msg.env.pubkey` on receiving node to confirm normalization matches.

4) Relay alignment check:
   - Surface the relays actually used for the temp echo node (resolvedRelays) in UI/logs; ensure overlap across devices.

5) Dev-server noise:
   - Clean `npm run dev` and confirm asset serving to eliminate console load errors as a confounder.

## Files Touched So Far
- `src/lib/igloo.ts`
- `src/pages/Signer.tsx`
- `src/main.tsx`
