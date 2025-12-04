import * as React from 'react';
import { StatusDot, type StatusState } from '@/components/ui/status-indicator';
import { Users } from 'lucide-react';

export type PeerPolicy = {
  alias: string;
  pubkey: string;
  send: boolean;
  receive: boolean;
  state: StatusState;
};

const formatPubkey = (value: string) => `${value.slice(0, 10)}…${value.slice(-6)}`;

export function PeerList({ peers }: { peers: PeerPolicy[] }) {
  return (
    <div className="space-y-3">
      {peers.map((peer) => (
        <div key={peer.pubkey} className="rounded-lg border border-blue-900/40 bg-black/25 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-blue-50">
            <Users className="h-4 w-4 text-blue-400" />
            <span>{peer.alias}</span>
            <span className="text-xs text-blue-300/70">{formatPubkey(peer.pubkey)}</span>
            <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-blue-900/40 px-3 py-1 text-[11px] uppercase tracking-[0.3em]">
              <StatusDot state={peer.state} />
              {peer.state}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] uppercase tracking-[0.25em]">
            <div className={
              (peer.send ? 'border-emerald-500/40 text-emerald-300 bg-emerald-900/5' : 'border-rose-500/40 text-rose-300 bg-rose-900/5') +
              ' rounded-md border px-3 py-2 text-center font-semibold'
            }>
              send {peer.send ? 'allow' : 'deny'}
            </div>
            <div className={
              (peer.receive ? 'border-emerald-500/40 text-emerald-300 bg-emerald-900/5' : 'border-rose-500/40 text-rose-300 bg-rose-900/5') +
              ' rounded-md border px-3 py-2 text-center font-semibold'
            }>
              receive {peer.receive ? 'allow' : 'deny'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

