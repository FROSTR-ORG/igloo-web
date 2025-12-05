# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

igloo-web is a web-based NOSTR signer UI built with React that provides a simple web implementation of a FROSTR (Frost Signer). It uses the @frostr/igloo-core library for distributed cryptographic signing and relay management via Bifrost nodes.

## Build & Development Commands

```bash
npm run dev       # Start Vite dev server with hot-reload
npm run build     # TypeScript compile + Vite production build
npm run preview   # Preview production build locally
```

## Architecture

### Tech Stack
- React 18 + TypeScript + Vite
- TailwindCSS with custom design tokens (dark mode only)
- Radix UI primitives with CVA (class-variance-authority) for component variants
- Web Crypto API (AES-GCM encryption, PBKDF2 key derivation)
- @frostr/igloo-core for Bifrost node operations

### Application Flow

Three-page routing controlled by `AppState.route`:
1. **Onboarding** (`/src/pages/Onboarding.tsx`) - Initial setup: enter group credential, share credential, relays, and password
2. **Unlock** (`/src/pages/Unlock.tsx`) - Decrypt stored credentials with password
3. **Signer** (`/src/pages/Signer.tsx`) - Main control panel: manage node, relays, peers, view event log

### State Management

Single React Context store in `/src/lib/store.tsx`:
- `StoreProvider` wraps app at root
- `useStore()` hook provides access to global state
- State persisted in localStorage under `igloo.vault` key as encrypted bundle

### Key Modules

- `/src/lib/igloo.ts` - Bifrost node integration, credential validation, peer management
- `/src/lib/storage.ts` - Encrypted localStorage operations
- `/src/lib/crypto.ts` - Web Crypto wrappers (AES-GCM-256, PBKDF2 100k iterations)
- `/src/lib/nostr-shim.ts` - Runtime patch for nostr-tools SimplePool filter handling

### Path Alias

Import alias configured: `@/*` → `./src/*`

## UI Patterns

- All components use `cn()` utility from `/src/lib/utils.ts` for Tailwind class merging
- Button variants defined with CVA pattern in `/src/components/ui/button.tsx`
- Custom `.igloo-card` class for card styling
- Blue color palette: blue-100 through blue-900
- Design tokens in `/src/index.css` with CSS custom properties

## Important Notes

- This is an early prototype marked for rework
- No test suite currently exists
- Dark mode is permanent (no light mode toggle)
- Credentials are always encrypted before storage
- Node event listeners must be cleaned up on unmount to prevent memory leaks
