import * as React from 'react';
import { StatusBadge, type StatusState } from '@/components/ui/status-indicator';
import { IconButton } from '@/components/ui/icon-button';
import { Loader2, Radio, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PeerPolicy = {
  alias: string;
  pubkey: string;
  send: boolean;
  receive: boolean;
  state: StatusState;
};

type PeerListProps = {
  peers: PeerPolicy[];
  onPing?: (pubkey: string) => Promise<{ success: boolean; latency?: number }>;
  onPolicyChange?: (pubkey: string, field: 'send' | 'receive', value: boolean) => void;
  disabled?: boolean;
};

const formatPubkey = (value: string) => `${value.slice(0, 8)}…${value.slice(-4)}`;

export function PeerList({ peers, onPing, onPolicyChange, disabled }: PeerListProps) {
  if (peers.length === 0) {
    return <p className="text-center text-gray-500 py-8">No peers configured</p>;
  }

  return (
    <div className="space-y-2">
      {peers.map((peer) => (
        <PeerCard key={peer.pubkey} peer={peer} onPing={onPing} onPolicyChange={onPolicyChange} disabled={disabled} />
      ))}
    </div>
  );
}

type PeerCardProps = {
  peer: PeerPolicy;
  onPing?: PeerListProps['onPing'];
  onPolicyChange?: PeerListProps['onPolicyChange'];
  disabled?: boolean;
};

function PeerCard({ peer, onPing, onPolicyChange, disabled }: PeerCardProps) {
  const [pinging, setPinging] = React.useState(false);
  const [latency, setLatency] = React.useState<number | null>(null);

  const handlePing = async () => {
    if (!onPing || pinging) return;
    setPinging(true);
    setLatency(null);
    try {
      const result = await onPing(peer.pubkey);
      if (result.success && result.latency !== undefined) {
        setLatency(result.latency);
      }
    } finally {
      setPinging(false);
    }
  };

  const handlePolicyToggle = (field: 'send' | 'receive') => {
    if (!onPolicyChange) return;
    onPolicyChange(peer.pubkey, field, !peer[field]);
  };

  return (
    <div className="rounded-md border border-blue-900/30 bg-gray-800/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <User className="h-4 w-4 text-blue-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-sm text-blue-100 font-medium">{peer.alias}</span>
            <span className="ml-2 text-xs text-gray-500 font-mono">{formatPubkey(peer.pubkey)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {latency !== null && (
            <span className="text-xs text-green-400 font-mono">{latency}ms</span>
          )}
          <StatusBadge state={peer.state} />
          {onPing && (
            <IconButton
              variant="ghost"
              size="sm"
              icon={pinging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
              onClick={handlePing}
              disabled={disabled || pinging}
              tooltip="Ping peer"
              className="text-gray-500 hover:text-blue-300"
            />
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <PolicyBadge type="send" allowed={peer.send} onClick={() => handlePolicyToggle('send')} interactive={!!onPolicyChange} />
        <PolicyBadge type="receive" allowed={peer.receive} onClick={() => handlePolicyToggle('receive')} interactive={!!onPolicyChange} />
      </div>
    </div>
  );
}

type PolicyBadgeProps = {
  type: 'send' | 'receive';
  allowed: boolean;
  onClick?: () => void;
  interactive?: boolean;
};

function PolicyBadge({ type, allowed, onClick, interactive }: PolicyBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
        allowed
          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : 'bg-red-500/10 text-red-400 border border-red-500/20',
        interactive && 'cursor-pointer hover:opacity-80',
        !interactive && 'cursor-default'
      )}
    >
      {type}: {allowed ? 'allow' : 'deny'}
    </button>
  );
}

