# igloo-web
Browser-first FROSTR signer built with React/Vite, `@frostr/igloo-core`, and `@frostr/bifrost`. Runs entirely in your tab; your share stays encrypted in localStorage.

## How it fits
- FROSTR splits an nsec into k-of-n shares and coordinates signing over Nostr relays via bifrost nodes.  
- Igloo apps: 
  - igloo-desktop (generate/manage shares)
  - frost2x (browser extension)
  - igloo-server (always-on signer)
  - igloo-web is the lightweight, no-install signer you can spin up in any browser.
- `@frostr/igloo-core` is the app-facing wrapper: it exposes credential/relay/peer helpers and a thin API for spinning up bifrost nodes so every Igloo app shares the same behavior. It saves app builders from wiring nostr-p2p/frost directly.
- `@frostr/bifrost` is the reference FROSTR node: it rides on cmdruid’s `@cmdcode/nostr-p2p` (nostr relay SDK) and `@cmdcode/frost` (threshold Schnorr lib); igloo-core layers on top instead of re-implementing those pieces.
- The FROSTR protocol itself lives in `frostr-org/frostr`; bifrost and all Igloo apps track that spec.
- Handy links: protocol spec https://github.com/frostr-org/frostr, transport https://github.com/cmdruid/nostr-p2p, threshold lib https://github.com/cmdruid/frost.

## Features
- Guided onboarding validates `bfgroup`/`bfshare` creds before saving; relays are normalized and stored with an optional keyset name.
- Encrypts group/share + relay list with password-protected AES-GCM; quick unlock flow on revisit.
- Start/stop the signer node with configurable relays; auto-publishes an echo to self, responds to `/echo/req`, and shows decoded credential JSON on demand.
- Peer list with allow/block policy per peer, ping + latency checks, status refresh; event log for `/sign`, `/ecdh`, `/ping`, echo events (kept to 200 entries).
- Clipboard helpers, relay add/remove, and a “Clear credentials” safety modal.

## Quick start (dev)
- `npm install`
- `npm run dev` then open http://localhost:5173
- `npm run build` → production assets in `dist/`; `npm run preview` to smoke-test the build.

## Using the signer
1. Generate a FROSTR keyset in Igloo Desktop or CLI and copy one `bfgroup` + `bfshare`.
2. Paste credentials here, choose a password to encrypt the bundle, set relays (defaults: `wss://relay.primal.net`, `wss://relay.damus.io`).
3. Start the signer and keep the tab open so peers can reach you over shared relays.
4. Adjust peer policies or relays as needed; clear credentials when retiring this node.

## Notes
- Everything runs client-side; no server required.
- Ensure at least one common relay with your other signers for successful rounds.
