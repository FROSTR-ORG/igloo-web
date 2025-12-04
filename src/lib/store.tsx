import React, { createContext, useContext, useMemo, useState } from 'react';
import { clearStoredShare, hasStoredShare, loadStoredShare, saveStoredShare, type StoredShare } from './storage';
import { DEFAULT_RELAYS, normalizeRelays } from './igloo';

export type AppRoute = 'unlock' | 'onboarding' | 'signer';

type AppState = {
  route: AppRoute;
  setRoute: (r: AppRoute) => void;
  share?: StoredShare;
  setShare: (s?: StoredShare) => void;
  saveNewShare: (password: string, s: StoredShare) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  logout: () => void;
};

const Store = createContext<AppState | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const initialRoute: AppRoute = hasStoredShare() ? 'unlock' : 'onboarding';
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const [share, setShare] = useState<StoredShare | undefined>(undefined);

  async function saveNewShare(password: string, s: StoredShare) {
    const { relays } = normalizeRelays(s.relays ?? DEFAULT_RELAYS);
    const payload = { ...s, relays };
    await saveStoredShare(password, payload);
    setShare(payload);
    setRoute('signer');
  }

  async function unlock(password: string) {
    const s = await loadStoredShare(password);
    const relays = s.relays?.length ? s.relays : DEFAULT_RELAYS;
    setShare({ ...s, relays });
    setRoute('signer');
  }

  function logout() {
    setShare(undefined);
    clearStoredShare();
    setRoute('onboarding');
  }

  const value = useMemo<AppState>(() => ({ route, setRoute, share, setShare, saveNewShare, unlock, logout }), [route, share]);
  return <Store.Provider value={value}>{children}</Store.Provider>;
}

export function useStore() {
  const ctx = useContext(Store);
  if (!ctx) throw new Error('StoreProvider missing');
  return ctx;
}
