import * as React from 'react';
import { PageLayout } from '@/components/ui/page-layout';
import { AppHeader } from '@/components/ui/app-header';
import { ContentCard } from '@/components/ui/content-card';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Textarea } from '@/components/ui/textarea';
import { RelayInput } from '@/components/ui/relay-input';
import { PeerList, type PeerPolicy } from '@/components/ui/peer-list';
import { EventLog, type LogEntry } from '@/components/ui/event-log';
import { StatusDot, StatusBadge, type StatusState } from '@/components/ui/status-indicator';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  HelpCircle,
  PauseCircle,
  PlayCircle,
  Radio,
  SignalHigh,
  SignalMedium,
  SignalZero,
  Users
} from 'lucide-react';
import { useStore } from '@/lib/store';
import {
  DEFAULT_RELAYS,
  buildPeerList,
  detachEvent,
  getCredentialDiagnostics,
  normalizeRelays,
  pingSinglePeer,
  refreshPeerStatuses,
  startSignerNode,
  stopSignerNode,
  type NodeWithEvents
} from '@/lib/igloo';
import { loadPeerPolicies, savePeerPolicies } from '@/lib/storage';

const MAX_LOGS = 200;

type RelayState = {
  url: string;
  latency: string;
  sync: string;
  state: StatusState;
};

const EVENT_LABELS: Record<string, { level: string; message: string }> = {
  ready: { level: 'READY', message: 'Node is ready' },
  closed: { level: 'INFO', message: 'Node closed connection' },
  error: { level: 'ERROR', message: 'Node error' }
};

const formatPubkey = (value: string) => `${value.slice(0, 10)}…${value.slice(-6)}`;

// Merge extracted peers with saved policies
function initializePeers(group: string, share: string): PeerPolicy[] {
  const extractedPeers = buildPeerList(group, share);
  const savedPolicies = loadPeerPolicies();

  return extractedPeers.map((peer) => {
    const saved = savedPolicies.find((p) => p.pubkey === peer.pubkey);
    if (saved) {
      return { ...peer, send: saved.send, receive: saved.receive };
    }
    return peer;
  });
}

export default function SignerPage() {
  const { share, logout } = useStore();
  const [expanded, setExpanded] = React.useState({ group: false, share: false });
  const [relays, setRelays] = React.useState<string[]>(share?.relays?.length ? share.relays : DEFAULT_RELAYS);
  const [peers, setPeers] = React.useState<PeerPolicy[]>(() => (share ? initializePeers(share.group, share.share) : []));
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [nodeStatus, setNodeStatus] = React.useState<'stopped' | 'connecting' | 'running'>(share ? 'stopped' : 'stopped');
  const [nodeError, setNodeError] = React.useState<string | null>(null);
  const nodeRef = React.useRef<NodeWithEvents | null>(null);
  const cleanupRef = React.useRef<(() => void) | null>(null);

  const diagnostics = React.useMemo(() => getCredentialDiagnostics(share?.group, share?.share), [share]);

  React.useEffect(() => {
    setRelays(share?.relays?.length ? share.relays : DEFAULT_RELAYS);
    setPeers(share ? initializePeers(share.group, share.share) : []);
    cleanupRef.current?.();
    cleanupRef.current = null;
    stopSignerNode(nodeRef.current);
    nodeRef.current = null;
    setNodeStatus('stopped');
    setLogs([]);
  }, [share]);

  React.useEffect(() => {
    return () => {
      cleanupRef.current?.();
      stopSignerNode(nodeRef.current);
      nodeRef.current = null;
    };
  }, []);

  const addLog = React.useCallback((level: string, message: string, detail?: unknown) => {
    const entry: LogEntry = {
      time: new Date().toLocaleTimeString(),
      level,
      message,
      detail: detail === undefined ? undefined : formatDetail(detail)
    };
    setLogs((prev) => [...prev.slice(-MAX_LOGS + 1), entry]);
  }, []);

  const setupNodeListeners = React.useCallback(
    (node: NodeWithEvents) => {
      // Note: 'ready' event often fires before listeners are attached,
      // so we set status to 'running' immediately after await in handleStart.
      // This handler is a fallback in case the event fires after attachment.
      const handleReady = () => {
        setNodeStatus((prev) => (prev === 'connecting' ? 'running' : prev));
        setNodeError(null);
      };
      const handleClosed = () => {
        setNodeStatus('stopped');
        addLog('INFO', 'Node closed connection');
      };
      const handleError = (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown node error';
        setNodeError(msg);
        setNodeStatus('stopped');
        addLog('ERROR', 'Signer node error', msg);
      };
      const handleMessage = (msg: any) => {
        const tag = typeof msg?.tag === 'string' ? msg.tag : 'message';
        if (EVENT_LABELS[tag]) {
          addLog(EVENT_LABELS[tag].level, EVENT_LABELS[tag].message);
          return;
        }
        if (tag.startsWith('/sign/')) {
          addLog('SIGN', `Signature event ${tag}`);
        } else if (tag.startsWith('/ecdh/')) {
          addLog('ECDH', `ECDH event ${tag}`);
        } else if (tag.startsWith('/ping/')) {
          addLog('PING', `Ping event ${tag}`);
        }
      };

      node.on('ready', handleReady);
      node.on('closed', handleClosed);
      node.on('error', handleError);
      node.on('message', handleMessage);

      return () => {
        detachEvent(node, 'ready', handleReady);
        detachEvent(node, 'closed', handleClosed);
        detachEvent(node, 'error', handleError);
        detachEvent(node, 'message', handleMessage);
      };
    },
    [addLog]
  );

  const handleStart = async () => {
    if (!share) return;
    const { relays: normalized, errors } = normalizeRelays(relays.length ? relays : DEFAULT_RELAYS);
    if (errors.length) {
      addLog('INFO', `Relay warnings: ${errors.join(', ')}`);
    }
    setRelays(normalized);
    setNodeStatus('connecting');
    try {
      const node = (await startSignerNode({ group: share.group, share: share.share, relays: normalized })) as NodeWithEvents;
      nodeRef.current = node;
      cleanupRef.current?.();
      cleanupRef.current = setupNodeListeners(node);

      // Node is ready when createAndConnectNode resolves - don't wait for 'ready' event
      // (the event may have already fired before listeners were attached)
      setNodeStatus('running');
      setNodeError(null);
      addLog('READY', 'Signer node ready');
      addLog('INFO', `Connected to ${normalized.length} relays`);

      const updatedPeers = await refreshPeerStatuses(node, share.group, share.share, peers.length ? peers : buildPeerList(share.group, share.share));
      setPeers(updatedPeers);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start signer';
      setNodeError(message);
      setNodeStatus('stopped');
      addLog('ERROR', 'Failed to start signer', message);
      stopSignerNode(nodeRef.current);
      nodeRef.current = null;
    }
  };

  const handleStop = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    stopSignerNode(nodeRef.current);
    nodeRef.current = null;
    setNodeStatus('stopped');
    addLog('INFO', 'Signer stopped');
  };

  const handleKeepAlive = async () => {
    if (!share || !nodeRef.current) {
      addLog('INFO', 'Start the signer before sending keep-alive');
      return;
    }
    addLog('PING', 'Keep-alive requested');
    const updatedPeers = await refreshPeerStatuses(nodeRef.current, share.group, share.share, peers);
    setPeers(updatedPeers);
  };

  const handlePingPeer = React.useCallback(async (pubkey: string) => {
    if (!nodeRef.current) {
      addLog('INFO', 'Start the signer before pinging peers');
      return { success: false };
    }
    const peerAlias = peers.find((p) => p.pubkey === pubkey)?.alias || 'Peer';
    addLog('PING', `Pinging ${peerAlias}...`);
    const result = await pingSinglePeer(nodeRef.current, pubkey);

    // Update peer state based on ping result
    setPeers((prev) =>
      prev.map((p) =>
        p.pubkey === pubkey ? { ...p, state: result.success ? 'online' : 'offline' } : p
      )
    );

    if (result.success) {
      addLog('PING', `${peerAlias} responded${result.latency ? ` in ${result.latency}ms` : ''}`);
    } else {
      addLog('PING', `${peerAlias} did not respond${result.error ? `: ${result.error}` : ''}`);
    }

    return result;
  }, [peers, addLog]);

  const handlePolicyChange = React.useCallback((pubkey: string, field: 'send' | 'receive', value: boolean) => {
    const peerAlias = peers.find((p) => p.pubkey === pubkey)?.alias || 'Peer';
    setPeers((prev) => {
      const updated = prev.map((p) =>
        p.pubkey === pubkey ? { ...p, [field]: value } : p
      );
      // Persist to localStorage
      savePeerPolicies(updated.map((p) => ({ pubkey: p.pubkey, send: p.send, receive: p.receive })));
      return updated;
    });
    addLog('INFO', `${peerAlias} ${field} policy set to ${value ? 'allow' : 'deny'}`);
  }, [peers, addLog]);

  const signerState: StatusState = nodeStatus === 'running' ? 'online' : nodeStatus === 'connecting' ? 'warning' : 'offline';
  const relayRows: RelayState[] = (relays.length ? relays : DEFAULT_RELAYS).map((url) => ({
    url,
    latency: nodeStatus === 'running' ? '—' : '…',
    sync: nodeStatus === 'running' ? '100%' : '0%',
    state: signerState
  }));

  function copy(text: string) {
    if (!text) return;
    navigator.clipboard?.writeText(text);
  }

  if (!share) {
    return (
      <PageLayout header={<AppHeader subtitle="Signer" title="Waiting for credentials" />}>        
        <ContentCard title="No credentials" description="Onboard first to add a share.">
          <Button variant="ghost" onClick={logout}>
            Go to onboarding
          </Button>
        </ContentCard>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      header={
        <AppHeader
          subtitle="Signer"
          title="Signer Control"
          right={
            <Button variant="ghost" onClick={logout}>
              Log out
            </Button>
          }
        />
      }
    >
      {/* Share context */}
      <div className="rounded-lg border border-blue-900/30 bg-gray-800/30 p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Users className="h-5 w-5 text-blue-400" />
          <span className="font-medium text-blue-100">Share #{diagnostics.summary?.idx ?? '—'}</span>
          {diagnostics.summary && (
            <span className="text-gray-400">Threshold {diagnostics.summary.threshold}/{diagnostics.summary.totalMembers}</span>
          )}
        </div>
        {share.group && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-gray-500">Group:</span>
            <span className="font-mono text-blue-300">{formatPubkey(share.group)}</span>
          </div>
        )}
      </div>

      {/* Credentials */}
      <ContentCard title="Credentials" description="Verified via igloo-core">
        <div className="grid gap-6 md:grid-cols-2">
          <CredentialField
            label="Group credential"
            value={share.group}
            decoded={diagnostics.group ?? {}}
            expanded={expanded.group}
            onToggle={() => setExpanded((prev) => ({ ...prev, group: !prev.group }))}
            status="valid"
            onCopy={() => copy(share.group)}
          />
          <CredentialField
            label="Share credential"
            value={share.share}
            decoded={diagnostics.share ?? {}}
            expanded={expanded.share}
            onToggle={() => setExpanded((prev) => ({ ...prev, share: !prev.share }))}
            status="valid"
            onCopy={() => copy(share.share)}
            sensitive
          />
        </div>
      </ContentCard>

      {/* Signer engine */}
      <ContentCard
        title="Signer Engine"
        description="Local signer must remain active to service remote requests"
      >
        <div className="flex flex-col gap-4">
          {/* Status row */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-blue-900/30 bg-gray-800/30 p-4">
            <div className="flex items-center gap-3">
              <StatusDot state={signerState} />
              <div>
                <p className="text-sm font-medium text-blue-100">
                  {nodeStatus === 'running' ? 'Running' : nodeStatus === 'connecting' ? 'Connecting...' : 'Stopped'}
                </p>
                <p className="text-xs text-gray-500">Requires valid group + share + relay quorum</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Activity className="h-4 w-4" />
              {nodeStatus === 'running' ? 'Active' : 'Idle'}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={nodeStatus === 'running' ? handleStop : handleStart}
              variant={nodeStatus === 'running' ? 'destructive' : 'success'}
              className="min-w-[140px]"
            >
              {nodeStatus === 'running' ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
              {nodeStatus === 'running' ? 'Stop' : 'Start'}
            </Button>
            <Button type="button" variant="outline" onClick={handleKeepAlive}>
              <Radio className="h-4 w-4" />
              Keep-alive
            </Button>
          </div>
        </div>
        {nodeError && (
          <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {nodeError}
          </div>
        )}
      </ContentCard>

      {/* Relays */}
      <ContentCard title="Relay Connectivity" description="All configured relays should be reachable before accepting requests">
        <div className="mb-4">
          <RelayInput relays={relays} onChange={setRelays} />
        </div>
        <div className="space-y-2">
          {relayRows.map((relay) => (
            <div key={relay.url} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-900/30 bg-gray-800/30 p-3 text-sm">
              <div className="flex items-center gap-3 min-w-0">
                {relay.state === 'online' && <SignalHigh className="h-4 w-4 text-green-400 shrink-0" />}
                {relay.state === 'warning' && <SignalMedium className="h-4 w-4 text-yellow-400 shrink-0" />}
                {relay.state === 'offline' && <SignalZero className="h-4 w-4 text-red-400 shrink-0" />}
                <span className="font-mono text-blue-100 truncate">{relay.url}</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge state={relay.state} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-500 hover:text-red-400"
                  onClick={() => setRelays(relays.filter((r) => r !== relay.url))}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ContentCard>

      {/* Peers + Logs */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ContentCard title="Peer Policies" description="Click policy badges to toggle send / receive rules">
          <PeerList peers={peers} onPing={handlePingPeer} onPolicyChange={handlePolicyChange} disabled={nodeStatus !== 'running'} />
        </ContentCard>

        <ContentCard title="Event Log" description="Chronological digest of signer activity">
          <EventLog entries={logs} onClear={() => setLogs([])} />
        </ContentCard>
      </div>
    </PageLayout>
  );
}

type CredentialFieldProps = {
  label: string;
  value: string;
  expanded: boolean;
  onToggle: () => void;
  decoded?: Record<string, unknown> | unknown;
  status?: 'valid' | 'idle';
  onCopy?: () => void;
  sensitive?: boolean;
};

function CredentialField({ label, value, expanded, onToggle, decoded, status, onCopy, sensitive = false }: CredentialFieldProps) {
  const [visible, setVisible] = React.useState(!sensitive);
  const maskedValue = sensitive && !visible ? '•'.repeat(Math.min(value.length, 60)) : value;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-blue-300">{label}</span>
        <div className="flex items-center gap-2">
          {status === 'valid' && (
            <span className="inline-flex items-center gap-1 text-xs text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Valid
            </span>
          )}
          {sensitive && (
            <IconButton
              variant="ghost"
              size="sm"
              icon={visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              onClick={() => setVisible(!visible)}
              tooltip={visible ? 'Hide credential' : 'Show credential'}
              className="text-gray-500 hover:text-blue-300"
            />
          )}
          <IconButton variant="ghost" size="sm" icon={<HelpCircle className="h-4 w-4" />} tooltip="Match the credential exported from Igloo Desktop" className="text-gray-500 hover:text-blue-300" />
        </div>
      </div>
      <Textarea readOnly value={maskedValue} rows={3} className="text-xs" />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onToggle} className="flex-1">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Details
        </Button>
      </div>
      {expanded && (
        <pre className="rounded-md border border-blue-900/30 bg-gray-800/50 p-3 text-[11px] font-mono leading-relaxed text-blue-100 overflow-x-auto">
          {JSON.stringify(decoded ?? {}, null, 2)}
        </pre>
      )}
    </div>
  );
}

const formatDetail = (detail: unknown) => {
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
};
