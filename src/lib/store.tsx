import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  clearStoredProfile,
  hasStoredProfile,
  loadStoredProfile,
  saveStoredProfile,
  type StoredProfile
} from './storage';
import {
  DEFAULT_RELAYS,
  createSignerNode,
  connectSignerNode,
  normalizeRelays,
  stopSignerNode,
  type NodeWithEvents
} from './igloo';

export type AppRoute = 'onboarding' | 'signer';

type AppState = {
  route: AppRoute;
  setRoute: (r: AppRoute) => void;
  profile?: StoredProfile;
  setProfile: (s?: StoredProfile) => void;
  activeNode: NodeWithEvents | null;
  setActiveNode: (node: NodeWithEvents | null) => void;
  saveProfile: (s: StoredProfile) => Promise<void>;
  connectOnboarding: (s: StoredProfile) => Promise<void>;
  logout: () => void;
};

const Store = createContext<AppState | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const initialRoute: AppRoute = hasStoredProfile() ? 'signer' : 'onboarding';
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const [profile, setProfile] = useState<StoredProfile | undefined>(() => {
    try {
      if (!hasStoredProfile()) return undefined;
      return loadStoredProfile();
    } catch {
      return undefined;
    }
  });
  const [activeNode, setActiveNode] = useState<NodeWithEvents | null>(null);

  async function saveProfile(s: StoredProfile) {
    const { relays } = normalizeRelays(s.relays ?? DEFAULT_RELAYS);
    const payload = { ...s, relays };
    saveStoredProfile(payload);
    setProfile(payload);
    setRoute('signer');
  }

  async function connectOnboarding(s: StoredProfile) {
    const { relays } = normalizeRelays(s.relays ?? DEFAULT_RELAYS);
    const payload = { ...s, relays };

    stopSignerNode(activeNode);
    setActiveNode(null);

    const node = createSignerNode({
      onboardPackage: payload.onboardPackage,
      relays: payload.relays
    });

    try {
      await connectSignerNode(node);
      saveStoredProfile(payload);
      setProfile(payload);
      setActiveNode(node);
      setRoute('signer');
    } catch (error) {
      stopSignerNode(node);
      throw error;
    }
  }

  function logout() {
    stopSignerNode(activeNode);
    setActiveNode(null);
    setProfile(undefined);
    clearStoredProfile();
    setRoute('onboarding');
  }

  const value = useMemo<AppState>(
    () => ({
      route,
      setRoute,
      profile,
      setProfile,
      activeNode,
      setActiveNode,
      saveProfile,
      connectOnboarding,
      logout
    }),
    [route, profile, activeNode]
  );
  return <Store.Provider value={value}>{children}</Store.Provider>;
}

export function useStore() {
  const ctx = useContext(Store);
  if (!ctx) throw new Error('StoreProvider missing');
  return ctx;
}
