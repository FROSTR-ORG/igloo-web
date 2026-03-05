import { WebSocketServer, type WebSocket } from 'ws';

import type { NostrEventWire } from './types';

type RelayFilter = {
  kinds?: number[];
  authors?: string[];
  since?: number;
  until?: number;
};

type RelayClientState = {
  socket: WebSocket;
  subs: Map<string, RelayFilter[]>;
};

export class LocalNostrRelay {
  private server: WebSocketServer | null = null;
  private readonly events = new Map<string, NostrEventWire>();
  private readonly clients = new Map<WebSocket, RelayClientState>();

  constructor(private readonly port: number) {}

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server = new WebSocketServer({ port: this.port }, () => resolve());
      this.server.once('error', reject);
      this.server.on('connection', (socket) => this.attachClient(socket));
    });
  }

  url(): string {
    return `ws://127.0.0.1:${this.port}`;
  }

  async stop(): Promise<void> {
    for (const state of this.clients.values()) {
      state.socket.terminate();
    }
    this.clients.clear();
    if (!this.server) return;

    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });
    this.server = null;
  }

  private attachClient(socket: WebSocket): void {
    const state: RelayClientState = { socket, subs: new Map() };
    this.clients.set(socket, state);

    socket.on('message', (raw) => {
      try {
        this.handleMessage(state, raw.toString());
      } catch {
        // Ignore malformed requests to keep the relay permissive for tests.
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
    });
  }

  private handleMessage(state: RelayClientState, raw: string): void {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return;

    const kind = parsed[0];
    if (kind === 'REQ') {
      const subId = parsed[1];
      if (typeof subId !== 'string') return;
      const filters = parsed.slice(2).filter((v): v is RelayFilter => !!v && typeof v === 'object');
      state.subs.set(subId, filters.length ? filters : [{}]);

      for (const event of this.events.values()) {
        if (this.matchesAnyFilter(event, filters)) {
          state.socket.send(JSON.stringify(['EVENT', subId, event]));
        }
      }
      state.socket.send(JSON.stringify(['EOSE', subId]));
      return;
    }

    if (kind === 'CLOSE') {
      const subId = parsed[1];
      if (typeof subId === 'string') {
        state.subs.delete(subId);
      }
      return;
    }

    if (kind === 'EVENT') {
      const event = parsed[1] as NostrEventWire | undefined;
      if (!event || typeof event.id !== 'string') return;
      this.events.set(event.id, event);
      this.broadcastEvent(event);
      state.socket.send(JSON.stringify(['OK', event.id, true, '']));
    }
  }

  private broadcastEvent(event: NostrEventWire): void {
    for (const state of this.clients.values()) {
      for (const [subId, filters] of state.subs.entries()) {
        if (!this.matchesAnyFilter(event, filters)) continue;
        state.socket.send(JSON.stringify(['EVENT', subId, event]));
      }
    }
  }

  private matchesAnyFilter(event: NostrEventWire, filters: RelayFilter[]): boolean {
    if (filters.length === 0) return true;
    return filters.some((filter) => this.matchesFilter(event, filter));
  }

  private matchesFilter(event: NostrEventWire, filter: RelayFilter): boolean {
    if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
    if (Array.isArray(filter.authors) && !filter.authors.includes(event.pubkey)) return false;
    if (typeof filter.since === 'number' && event.created_at < filter.since) return false;
    if (typeof filter.until === 'number' && event.created_at > filter.until) return false;
    return true;
  }
}
