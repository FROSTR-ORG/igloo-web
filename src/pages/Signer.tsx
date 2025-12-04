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
import { StatusDot, type StatusState } from '@/components/ui/status-indicator';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
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
  refreshPeerStatuses,
  startSignerNode,
  stopSignerNode,
  type NodeWithEvents
} from '@/lib/igloo';

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

export default function SignerPage() {
  const { share, logout } = useStore();
  const [expanded, setExpanded] = React.useState({ group: false, share: false });
  const [relays, setRelays] = React.useState<string[]>(share?.relays?.length ? share.relays : DEFAULT_RELAYS);
  const [peers, setPeers] = React.useState<PeerPolicy[]>(() => (share ? buildPeerList(share.group, share.share) : []));
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [nodeStatus, setNodeStatus] = React.useState<'stopped' | 'connecting' | 'running'>(share ? 'stopped' : 'stopped');
  const [nodeError, setNodeError] = React.useState<string | null>(null);
  const nodeRef = React.useRef<NodeWithEvents | null>(null);
  const cleanupRef = React.useRef<(() => void) | null>(null);

  const diagnostics = React.useMemo(() => getCredentialDiagnostics(share?.group, share?.share), [share]);

  React.useEffect(() => {
    setRelays(share?.relays?.length ? share.relays : DEFAULT_RELAYS);
    setPeers(share ? buildPeerList(share.group, share.share) : []);
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
      const handleReady = () => {
        setNodeStatus('running');
        setNodeError(null);
        addLog('READY', 'Signer node ready');
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
      <div className="igloo-card p-5">
        <div className="flex flex-wrap items-center gap-3 text-sm text-blue-200/80">
          <Users className="h-5 w-5 text-blue-400" />
          <span className="font-medium text-blue-100">Share #{diagnostics.summary?.idx ?? '—'}</span>
          {diagnostics.summary && (
            <span className="text-blue-300/70">• Threshold {diagnostics.summary.threshold}/{diagnostics.summary.totalMembers}</span>
          )}
        </div>
        {share.group && (
          <div className="mt-3 text-xs text-blue-300">
            Group
            <div className="mt-1 truncate font-mono text-blue-100">{formatPubkey(share.group)}</div>
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
          />
        </div>
      </ContentCard>

      {/* Signer engine */}
      <ContentCard
        title="Signer engine"
        description="Local signer must remain active to service remote requests"
        action={
          <span className="inline-flex items-center gap-2 text-xs text-blue-200/80">
            <Activity className="h-3.5 w-3.5 text-cyan-300" />
            {nodeStatus === 'running' ? 'Pulse nominal' : nodeStatus === 'connecting' ? 'Connecting…' : 'Idle'}
          </span>
        }
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 items-center gap-3 rounded-xl border border-blue-900/30 bg-blue-900/10 p-4">
            <StatusDot state={signerState} />
            <div>
              <p className="text-sm font-semibold text-blue-100">Signer {nodeStatus === 'running' ? 'Running' : nodeStatus === 'connecting' ? 'Connecting' : 'Stopped'}</p>
              <p className="text-xs text-blue-200/70">Requires valid group + share + relay quorum</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="button" onClick={nodeStatus === 'running' ? handleStop : handleStart} size="lg" variant={nodeStatus === 'running' ? 'destructive' : 'success'} className="inline-flex min-w-[180px] items-center justify-center gap-2 shadow-lg">
              {nodeStatus === 'running' ? <PauseCircle className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
              {nodeStatus === 'running' ? 'Stop signer' : 'Start signer'}
            </Button>
            <Button type="button" variant="outline" size="lg" className="inline-flex items-center justify-center gap-2 px-5 py-3" onClick={handleKeepAlive}>
              <Radio className="h-5 w-5 text-cyan-300" />
              Test keep-alive
            </Button>
          </div>
        </div>
        {nodeError && <p className="mt-3 text-sm text-red-400">{nodeError}</p>}
      </ContentCard>

      {/* Relays */}
      <ContentCard title="Relay connectivity" description="All configured relays should be reachable before accepting requests">
        <div className="mb-4">
          <RelayInput relays={relays} onChange={setRelays} />
        </div>
        <div className="space-y-3">
          {relayRows.map((relay) => (
            <div key={relay.url} className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-900/40 bg-black/30 p-3 text-sm">
              <div className="flex flex-1 items-center gap-3">
                {relay.state === 'online' && <SignalHigh className="text-emerald-400" />}
                {relay.state === 'warning' && <SignalMedium className="text-amber-400" />}
                {relay.state === 'offline' && <SignalZero className="text-rose-500" />}
                <div>
                  <p className="font-mono text-blue-50">{relay.url}</p>
                  <p className="text-xs text-blue-200/70">sync {relay.sync}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-blue-200/70">
                <span>{relay.latency}</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-900/50 px-3 py-1 capitalize">
                  <StatusDot state={relay.state} />
                  {relay.state}
                </span>
                <Button variant="outline" size="sm" className="rounded-full border px-3 py-1 text-blue-200 hover:text-blue-50" onClick={() => setRelays(relays.filter((r) => r !== relay.url))}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ContentCard>

      {/* Peers + Logs */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ContentCard title="Peer policies" description="Fine-grained send / receive rules per peer">
          <PeerList peers={peers} />
        </ContentCard>

        <ContentCard title="Event log" description="Chronological digest of signer activity">
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
};

function CredentialField({ label, value, expanded, onToggle, decoded, status, onCopy }: CredentialFieldProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-blue-300">
        <span>{label}</span>
        <div className="flex items-center gap-2 text-xs font-normal tracking-normal text-blue-200/80">
          {status === 'valid' && (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Validated
            </span>
          )}
          <IconButton variant="ghost" size="sm" icon={<HelpCircle className="h-4 w-4" />} tooltip="Match the credential exported from Igloo Desktop" className="text-blue-400 hover:text-blue-200" />
        </div>
      </div>
      <Textarea readOnly value={value} rows={3} />
      <div className="flex gap-2 text-xs">
        <Button variant="secondary" size="sm" className="flex-1 justify-center" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onToggle} className="flex-1 justify-center uppercase tracking-[0.2em] text-blue-200">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Decoded
        </Button>
      </div>
      {expanded && <pre className="rounded-lg border border-blue-900/40 bg-black/40 p-3 text-[11px] font-mono leading-relaxed text-blue-100">{JSON.stringify(decoded ?? {}, null, 2)}</pre>}
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
