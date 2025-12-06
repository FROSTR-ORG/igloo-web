import * as React from 'react';
import { type StatusState } from '@/components/ui/status-indicator';
import { IconButton } from '@/components/ui/icon-button';
import { ChevronDown, ChevronUp, HelpCircle, Loader2, Radio, RefreshCw, SlidersHorizontal } from 'lucide-react';
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
  onRefreshAll?: () => void;
  disabled?: boolean;
};

const formatPubkey = (value: string) => `${value.slice(0, 14)}...${value.slice(-8)}`;

export function PeerList({ peers, onPing, onPolicyChange, onRefreshAll, disabled }: PeerListProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const onlineCount = peers.filter(p => p.state === 'online').length;

  return (
    <div className="border border-blue-900/30 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/30 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {collapsed ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
          <span className="text-blue-300 font-medium">Peer List</span>
          <div className={cn(
            'w-2 h-2 rounded-full',
            onlineCount > 0 ? 'bg-green-500' : 'bg-red-500'
          )} />
          <span className="text-xs text-green-400 bg-green-500/20 px-2 py-0.5 rounded">
            {onlineCount} online
          </span>
          <span className="text-xs text-gray-400 bg-gray-500/20 px-2 py-0.5 rounded">
            {peers.length} total
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="italic">{collapsed ? 'Click to expand' : 'Click to collapse'}</span>
          {onRefreshAll && (
            <IconButton
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={(e) => {
                e.stopPropagation();
                onRefreshAll();
              }}
              disabled={disabled}
              tooltip="Refresh all"
              className="text-gray-400 hover:text-blue-300"
            />
          )}
        </div>
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
          {peers.length === 0 ? (
            <p className="text-center text-gray-500 py-4 text-sm">No peers configured</p>
          ) : (
            peers.map((peer) => (
              <PeerCard key={peer.pubkey} peer={peer} onPing={onPing} onPolicyChange={onPolicyChange} disabled={disabled} />
            ))
          )}
        </div>
      )}
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
  const [showPolicyControls, setShowPolicyControls] = React.useState(false);

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

  const isOnline = peer.state === 'online';

  return (
    <div className="rounded-lg border border-blue-900/20 bg-gray-800/30 overflow-hidden">
      {/* Main peer row */}
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Prominent status indicator */}
          <div className={cn(
            'w-3 h-3 rounded-full shrink-0',
            isOnline ? 'bg-green-500 shadow-[0_0_8px_2px_rgba(34,197,94,0.4)]' : 'bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.4)]'
          )} />
          <div className="min-w-0">
            <span className="text-sm text-blue-300 font-mono">{formatPubkey(peer.pubkey)}</span>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={cn(
                'text-xs',
                isOnline ? 'text-green-400' : 'text-red-400'
              )}>
                Status: {isOnline ? 'Online' : 'Offline'}
              </span>
              {latency !== null && (
                <>
                  <span className="text-gray-500 text-xs">•</span>
                  <span className="text-xs text-blue-400">Ping: {latency}ms</span>
                </>
              )}
              <span className="text-gray-500 text-xs">•</span>
              <span className="text-xs text-gray-400">
                Policy: out {peer.send ? 'allow' : 'block'}, in {peer.receive ? 'allow' : 'block'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onPolicyChange && (
            <IconButton
              variant="ghost"
              size="sm"
              icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
              onClick={() => setShowPolicyControls(!showPolicyControls)}
              tooltip="Policy controls"
              className={cn(
                "text-gray-400 hover:text-blue-300",
                showPolicyControls && "bg-blue-900/30 text-blue-300"
              )}
            />
          )}
          {onPing && (
            <IconButton
              variant="ghost"
              size="sm"
              icon={pinging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
              onClick={handlePing}
              disabled={disabled || pinging}
              tooltip="Ping"
              className="text-gray-400 hover:text-blue-300"
            />
          )}
        </div>
      </div>

      {/* Expandable policy controls */}
      {showPolicyControls && onPolicyChange && (
        <div className="border-t border-blue-900/20 bg-gray-900/30 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">Policy controls</span>
            <span title="Outbound controls requests you initiate; inbound gates requests arriving from this peer.">
              <HelpCircle size={14} className="text-gray-500 cursor-help" />
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPolicyChange(peer.pubkey, 'send', !peer.send)}
              className={cn(
                'px-4 py-2 rounded text-xs font-medium uppercase tracking-wide transition-colors border',
                peer.send
                  ? 'border-green-500/50 text-green-400 bg-green-500/10 hover:bg-green-500/20'
                  : 'border-red-500/50 text-red-400 bg-red-500/10 hover:bg-red-500/20'
              )}
            >
              Outbound {peer.send ? 'Allow' : 'Block'}
            </button>
            <button
              type="button"
              onClick={() => onPolicyChange(peer.pubkey, 'receive', !peer.receive)}
              className={cn(
                'px-4 py-2 rounded text-xs font-medium uppercase tracking-wide transition-colors border',
                peer.receive
                  ? 'border-green-500/50 text-green-400 bg-green-500/10 hover:bg-green-500/20'
                  : 'border-red-500/50 text-red-400 bg-red-500/10 hover:bg-red-500/20'
              )}
            >
              Inbound {peer.receive ? 'Allow' : 'Block'}
            </button>
          </div>

          <p className="text-xs text-gray-500">
            Outbound controls requests you initiate; inbound gates requests arriving from this peer.
          </p>
        </div>
      )}
    </div>
  );
}
