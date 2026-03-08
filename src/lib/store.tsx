import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  clearRuntimeSnapshot,
  clearStoredProfile,
  hasStoredProfile,
  loadStoredProfile,
  saveRuntimeSnapshot,
  saveStoredProfile,
  type StoredProfile
} from './storage';
import {
  DEFAULT_RELAYS,
  createSignerNode,
  connectSignerNode,
  decodeOnboardingProfile,
  getPublicKeyFromNode,
  getRuntimeSnapshot,
  normalizeRelays,
  stopSignerNode,
  type NodeWithEvents
} from './igloo';

export type AppRoute = 'onboarding' | 'signer';

type OnboardingConnectInput = {
  keysetName?: string;
  onboardPackage: string;
  onboardPassword: string;
  relays: string[];
};

type AppState = {
  route: AppRoute;
  setRoute: (r: AppRoute) => void;
  profile?: StoredProfile;
  setProfile: (s?: StoredProfile) => void;
  activeNode: NodeWithEvents | null;
  setActiveNode: (node: NodeWithEvents | null) => void;
  saveProfile: (s: StoredProfile) => Promise<void>;
  connectOnboarding: (s: OnboardingConnectInput) => Promise<void>;
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

  async function connectOnboarding(s: OnboardingConnectInput) {
    const { relays } = normalizeRelays(s.relays ?? DEFAULT_RELAYS);
    const decoded = await decodeOnboardingProfile(s.onboardPackage, s.onboardPassword);

    stopSignerNode(activeNode);
    setActiveNode(null);

    const node = createSignerNode({
      mode: 'onboarding',
      onboardPackage: s.onboardPackage,
      onboardPassword: s.onboardPassword,
      relays
    });

    try {
      await connectSignerNode(node);
      saveRuntimeSnapshot(JSON.stringify(getRuntimeSnapshot(node)));
      const payload = {
        keysetName: s.keysetName?.trim(),
        relays,
        groupPublicKey: getPublicKeyFromNode(node),
        publicKey: getPublicKeyFromNode(node),
        peerPubkey: decoded.peerPubkey
      };
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
    clearRuntimeSnapshot();
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
