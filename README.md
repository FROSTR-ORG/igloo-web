# igloo-web
Web UI for the v2 `bifrost-rs` signer runtime hosted in the browser via WASM.

## v2 Hard Cut
- Legacy `bfgroup`/`bfshare` onboarding is removed.
- Onboarding now uses a `bfonboard1...` package.
- Runtime now uses:
  - `bifrost-bridge-core` + `bifrost-bridge-wasm` (Rust, compiled to WASM)
  - TypeScript Nostr client (`nostr-tools`) for relay ingress/egress
- There is no v1 compatibility layer.

## WASM Artifacts
`igloo-web` dynamically loads:
- `/wasm/bifrost_bridge_wasm.js`
- `/wasm/bifrost_bridge_wasm_bg.wasm`

Build/copy artifacts into `public/wasm`:
- `npm run build:bridge-wasm`

Prerequisites:
- `rustup target add wasm32-unknown-unknown`
- `wasm-pack`
- `clang` (required by secp256k1 build for wasm target)

Regenerate artifacts whenever runtime or wire behavior changes in:
- `repos/bifrost-rs/crates/bifrost-bridge-core`
- `repos/bifrost-rs/crates/bifrost-bridge-wasm`
- `repos/bifrost-rs/crates/bifrost-signer`
- `repos/bifrost-rs/crates/bifrost-codec`

## Environment
- `VITE_BIFROST_EVENT_KIND` (default: `20000`)

## Quick start (dev)
- `npm install`
- `npm run build:bridge-wasm`
- `npm run dev` then open [http://localhost:5173](http://localhost:5173)
- `npm run build`

## Automated tests
- `npm run test:int`
  - headless integration test for local relay + scripted peer actor handshake (`OnboardRequest`/`PingRequest`)
- `npm run test:e2e`
  - Playwright browser smoke test for onboarding -> signer screen -> policy toggle
- `npm run test:ci`
  - runs wasm build, integration tests, browser smoke, and production build

Notes:
- Browser smoke uses real WASM runtime and a local relay + peer actor harness.
- CI installs Chromium and runs these checks as PR gates (`.github/workflows/igloo-web-v2.yml`).

## Contributor hygiene
- Do not commit `dist/` or `*.tsbuildinfo`.
- Commit updated `public/wasm/*` artifacts when bridge/runtime changes affect browser behavior.

## Onboarding flow
1. Generate a v2 onboarding package (`bfonboard1...`) from your issuer device.
2. Paste it in onboarding (or launch with `?onboard=<bfonboard...>`), set relays.
3. Click `Connect and Continue` on onboarding.
4. On successful connect, app routes to Signer page.
4. Monitor peer status and event log in-app.

## Demo bootstrap script
From repo root:
- `scripts/start-igloo-web-demo.sh`

Useful flags:
- `FORCE_WASM_BUILD=1 scripts/start-igloo-web-demo.sh`
- `FORCE_KEYGEN=1 scripts/start-igloo-web-demo.sh`
- `FORCE_WASM_BUILD=1 FORCE_KEYGEN=1 scripts/start-igloo-web-demo.sh`

Script output includes:
- `Onboard URL: http://127.0.0.1:5173/?onboard=...` for autofill onboarding.
