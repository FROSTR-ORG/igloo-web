export type NostrEventWire = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export type BridgeEnvelopeWire = {
  request_id: string;
  sent_at: number;
  payload: {
    type: string;
    data: unknown;
  };
};

export type GroupMemberWire = {
  idx: number;
  pubkey: string;
};

export type GroupPackageWire = {
  group_pk: string;
  threshold: number;
  members: GroupMemberWire[];
};

export type OnboardFixture = {
  relayUrl: string;
  eventKind: number;
  onboardingPackage: string;
  actorSecretHex32: string;
  actorPubkeyXonly: string;
  actorPubkey33: string;
  shareSecretHex32: string;
  sharePubkeyXonly: string;
  sharePubkey33: string;
  shareIdx: number;
  group: GroupPackageWire;
};
