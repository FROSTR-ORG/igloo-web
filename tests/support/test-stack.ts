import { createOnboardFixture } from './onboard-fixture';
import { LocalNostrRelay } from './local-relay';
import { PeerActor } from './peer-actor';

export async function startTestStack(eventKind = 20_000) {
  const port = 18000 + Math.floor(Math.random() * 10000);
  const relay = new LocalNostrRelay(port);
  await relay.start();

  const fixture = createOnboardFixture({
    relayUrl: relay.url(),
    eventKind
  });

  const actor = new PeerActor({
    relayUrl: fixture.relayUrl,
    eventKind: fixture.eventKind,
    actorSecretHex32: fixture.actorSecretHex32,
    group: fixture.group
  });
  await actor.start();

  return {
    fixture,
    relay,
    actor,
    async stop() {
      await actor.stop();
      await relay.stop();
    }
  };
}
