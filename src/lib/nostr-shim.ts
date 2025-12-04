import { SimplePool } from 'nostr-tools';

// Shim nostr-tools SimplePool.subscribeMany to unwrap single-element filter arrays.
// This matches igloo-desktop/server behavior and avoids relay errors:
// "ERROR: bad req: provided filter is not an object".
try {
  const poolProto = SimplePool?.prototype as (typeof SimplePool.prototype & { __iglooSubscribeFixApplied?: boolean }) | undefined;
  if (poolProto && !poolProto.__iglooSubscribeFixApplied) {
    const original = poolProto.subscribeMany as (relays: unknown, filters: unknown, params: unknown) => any;
    if (typeof original === 'function') {
      poolProto.subscribeMany = function patchedSubscribeMany(this: unknown, relays: unknown, filters: unknown, params: unknown) {
        if (
          Array.isArray(filters) &&
          filters.length === 1 &&
          filters[0] &&
          typeof filters[0] === 'object' &&
          !Array.isArray(filters[0])
        ) {
          return original.call(this, relays, filters[0], params);
        }
        return original.call(this, relays, filters, params);
      } as typeof poolProto.subscribeMany;
      Object.defineProperty(poolProto, '__iglooSubscribeFixApplied', { value: true });
    }
  }
} catch (error) {
  console.warn('[IglooWeb] Failed to apply SimplePool subscribeMany shim:', error);
}

