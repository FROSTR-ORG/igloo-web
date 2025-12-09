import * as React from 'react';
import { PageLayout } from '@/components/ui/page-layout';
import { AppHeader } from '@/components/ui/app-header';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { PeerList, type PeerPolicy } from '@/components/ui/peer-list';
import { EventLog, type LogEntry } from '@/components/ui/event-log';
import { type StatusState } from '@/components/ui/status-indicator';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  HelpCircle,
  Plus,
  Trash2,
  User,
  X
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
  createSignerNode,
  connectSignerNode,
  stopSignerNode,
  publishEchoToSelf,
  respondToEchoRequest,
  type NodeWithEvents
} from '@/lib/igloo';
import { loadPeerPolicies, savePeerPolicies } from '@/lib/storage';

const MAX_LOGS = 200;

const EVENT_LABELS: Record<string, { level: string; message: string }> = {
  ready: { level: 'READY', message: 'Node is ready' },
  closed: { level: 'INFO', message: 'Node closed connection' },
  error: { level: 'ERROR', message: 'Node error' }
};

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
  const [copiedStates, setCopiedStates] = React.useState({ group: false, share: false });
  const [relays, setRelays] = React.useState<string[]>(share?.relays?.length ? share.relays : DEFAULT_RELAYS);
  const [newRelayUrl, setNewRelayUrl] = React.useState('');
  const [peers, setPeers] = React.useState<PeerPolicy[]>(() => (share ? initializePeers(share.group, share.share) : []));
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [nodeStatus, setNodeStatus] = React.useState<'stopped' | 'connecting' | 'running'>(share ? 'stopped' : 'stopped');
  const [nodeError, setNodeError] = React.useState<string | null>(null);
  const [showClearModal, setShowClearModal] = React.useState(false);
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

  const addLog = React.useCallback((level: string, message: string, data?: unknown) => {
    const entry: LogEntry = {
      time: new Date().toLocaleTimeString(),
      level,
      message,
      data,
      id: Math.random().toString(36).substring(2, 11)
    };
    setLogs((prev) => [...prev.slice(-MAX_LOGS + 1), entry]);
  }, []);

  // Note: Echo is now sent via the main node in handleStart after connecting.
  // This eliminates the race condition with temp nodes.

  const setupNodeListeners = React.useCallback(
    (node: NodeWithEvents) => {
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

        if (tag === '/echo/req' && nodeRef.current) {
          const fromPubkey = typeof msg?.env?.pubkey === 'string' ? msg.env.pubkey : 'unknown';
          void respondToEchoRequest(nodeRef.current, msg, (level, message, data) => {
            const levelMap: Record<string, string> = { info: 'INFO', warn: 'WARN', debug: 'DEBUG', error: 'ERROR' };
            addLog(levelMap[level] || 'INFO', message, data);
          }).then((handled) => {
            if (handled) {
              addLog('ECHO', 'Responded to echo request', { from: fromPubkey, id: msg?.id });
            } else {
              addLog('INFO', 'Ignored echo request from unknown peer', { from: fromPubkey, id: msg?.id });
            }
          }).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            addLog('WARN', 'Failed to handle echo request', message);
          });
        }

        if (EVENT_LABELS[tag]) {
          addLog(EVENT_LABELS[tag].level, EVENT_LABELS[tag].message, msg);
          return;
        }
        if (tag.startsWith('/sign/')) {
          addLog('SIGN', `Signature event ${tag}`, msg);
        } else if (tag.startsWith('/ecdh/')) {
          addLog('ECDH', `ECDH event ${tag}`, msg);
        } else if (tag.startsWith('/ping/')) {
          addLog('PING', `Ping event ${tag}`, msg);
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
      // Create node WITHOUT connecting first
      const node = createSignerNode({ group: share.group, share: share.share, relays: normalized }) as NodeWithEvents;

      // Clean up any old handlers and set up new ones BEFORE connecting
      // This prevents race conditions where messages arrive before handlers are attached
      cleanupRef.current?.();
      nodeRef.current = node;
      cleanupRef.current = setupNodeListeners(node);

      // NOW connect - handlers are ready to receive messages
      await connectSignerNode(node);

      setNodeStatus('running');
      setNodeError(null);
      addLog('READY', 'Signer node ready');
      addLog('INFO', `Connected to ${normalized.length} relays`);

      // Send echo to SELF (our own pubkey)
      // igloo-desktop's awaitShareEcho uses the SAME share credentials, so it has the SAME pubkey
      // Both can decrypt messages addressed to this pubkey (same private key from share)
      const echoLogger = (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => {
        const levelMap: Record<string, string> = { info: 'INFO', warn: 'WARN', debug: 'DEBUG', error: 'ERROR' };
        addLog(levelMap[level] || 'INFO', message, data);
      };

      publishEchoToSelf(node, echoLogger).then((success) => {
        if (success) {
          addLog('ECHO', 'Echo published to self to announce presence');
        }
      }).catch((error) => {
        const message = error instanceof Error ? error.message : 'Unknown echo error';
        addLog('WARN', 'Echo error', message);
      });

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

  const handlePingPeer = React.useCallback(async (pubkey: string) => {
    if (!nodeRef.current) {
      addLog('INFO', 'Start the signer before pinging peers');
      return { success: false };
    }
    const peerAlias = peers.find((p) => p.pubkey === pubkey)?.alias || 'Peer';
    addLog('PING', `Pinging ${peerAlias}...`);
    const result = await pingSinglePeer(nodeRef.current, pubkey);

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
      savePeerPolicies(updated.map((p) => ({ pubkey: p.pubkey, send: p.send, receive: p.receive })));
      return updated;
    });
    addLog('INFO', `${peerAlias} ${field} policy set to ${value ? 'allow' : 'deny'}`);
  }, [peers, addLog]);

  const handleCopy = async (text: string, field: 'group' | 'share') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates(prev => ({ ...prev, [field]: true }));
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [field]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleAddRelay = () => {
    if (newRelayUrl && !relays.includes(newRelayUrl)) {
      setRelays([...relays, newRelayUrl]);
      setNewRelayUrl('');
    }
  };

  const handleRemoveRelay = (urlToRemove: string) => {
    setRelays(relays.filter(url => url !== urlToRemove));
  };

  const isSignerRunning = nodeStatus === 'running';
  const isConnecting = nodeStatus === 'connecting';
  const canStart = share && relays.length > 0;

  const handleClearCredentials = () => {
    setShowClearModal(false);
    logout();
  };

  if (!share) {
    return (
      <PageLayout header={<AppHeader title="igloo web" />}>
        <div className="border border-blue-800/30 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-blue-300 mb-2">No credentials</h2>
          <p className="text-gray-400 text-sm mb-4">Onboard first to add a share.</p>
          <Button variant="ghost" onClick={logout}>
            Go to onboarding
          </Button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      header={
        <AppHeader
          title="igloo web"
          right={
            <Button variant="ghost" size="sm" onClick={() => setShowClearModal(true)}>
              <Trash2 className="h-4 w-4 mr-1.5" />
              Clear Credentials
            </Button>
          }
        />
      }
    >
      <div className="space-y-6">
        {/* Section header with tooltip */}
        <div className="flex items-center">
          <h2 className="text-blue-300 text-lg">Start your signer to handle requests</h2>
          <span title="The signer must be running to handle signature requests from clients. When active, it will communicate with other nodes through your configured relays.">
            <HelpCircle size={18} className="ml-2 text-blue-400 cursor-help" />
          </span>
        </div>

        {/* Share Information Header */}
        {diagnostics.summary && (
          <div className="border border-blue-800/30 rounded-lg p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-blue-400" />
                <span className="text-blue-200 font-medium">{share.keysetName || `Share ${diagnostics.summary.idx}`}</span>
              </div>
              <div className="text-gray-400">•</div>
              <div className="text-gray-300 text-sm">
                Index: <span className="text-blue-400 font-mono">{diagnostics.summary.idx}</span>
              </div>
              <div className="text-gray-400">•</div>
              <div className="text-gray-300 text-sm">
                Threshold: <span className="text-blue-400">{diagnostics.summary.threshold}</span>/<span className="text-blue-400">{diagnostics.summary.totalMembers}</span>
              </div>
            </div>
            {diagnostics.summary.pubkey && (
              <div className="mt-2">
                <div className="text-gray-300 text-sm">
                  Pubkey: <span className="font-mono text-xs text-blue-300 truncate block">{diagnostics.summary.pubkey}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Credential inputs section */}
        <div className="space-y-3">
          {/* Group credential */}
          <div className="flex">
            <Input
              type="text"
              value={share.group}
              className="bg-gray-800/50 border-gray-700/50 text-blue-300 py-2 text-sm w-full font-mono"
              readOnly
              disabled={isSignerRunning || isConnecting}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleCopy(share.group, 'group')}
              className="ml-2 bg-blue-800/30 text-blue-400 hover:text-blue-300 hover:bg-blue-800/50"
              title="Copy"
            >
              {copiedStates.group ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setExpanded(prev => ({ ...prev, group: !prev.group }))}
              className="ml-2 bg-blue-800/30 text-blue-400 hover:text-blue-300 hover:bg-blue-800/50"
              title="Decoded"
            >
              {expanded.group ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </Button>
          </div>

          {expanded.group && diagnostics.group && (
            <div className="space-y-1">
              <div className="text-xs text-gray-400 font-medium">Decoded Data:</div>
              <pre className="bg-gray-900/50 p-3 rounded text-xs text-blue-300 font-mono overflow-x-auto">
                {JSON.stringify(diagnostics.group, null, 2)}
              </pre>
            </div>
          )}

          {/* Share credential */}
          <div className="flex">
            <Input
              type="password"
              value={share.share}
              className="bg-gray-800/50 border-gray-700/50 text-blue-300 py-2 text-sm w-full font-mono"
              readOnly
              disabled={isSignerRunning || isConnecting}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleCopy(share.share, 'share')}
              className="ml-2 bg-blue-800/30 text-blue-400 hover:text-blue-300 hover:bg-blue-800/50"
              title="Copy"
            >
              {copiedStates.share ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setExpanded(prev => ({ ...prev, share: !prev.share }))}
              className="ml-2 bg-blue-800/30 text-blue-400 hover:text-blue-300 hover:bg-blue-800/50"
              title="Decoded"
            >
              {expanded.share ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </Button>
          </div>

          {expanded.share && diagnostics.share && (
            <div className="space-y-1">
              <div className="text-xs text-gray-400 font-medium">Decoded Data:</div>
              <pre className="bg-gray-900/50 p-3 rounded text-xs text-blue-300 font-mono overflow-x-auto">
                {JSON.stringify(diagnostics.share, null, 2)}
              </pre>
            </div>
          )}

          {/* Signer status row */}
          <div className="flex items-center justify-between mt-6">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                isSignerRunning ? 'bg-green-500 pulse-animation' :
                isConnecting ? 'bg-yellow-500 pulse-animation-yellow' :
                'bg-red-500'
              }`} />
              <span className="text-gray-300">
                Signer {isSignerRunning ? 'Running' : isConnecting ? 'Connecting...' : 'Stopped'}
              </span>
            </div>
            <Button
              onClick={isSignerRunning ? handleStop : handleStart}
              className={`px-6 py-2 ${
                isSignerRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              } transition-colors duration-200 text-sm font-medium`}
              disabled={!canStart || isConnecting}
            >
              {isSignerRunning ? 'Stop Signer' : isConnecting ? 'Connecting...' : 'Start Signer'}
            </Button>
          </div>

          {nodeError && (
            <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {nodeError}
            </div>
          )}
        </div>

        {/* Relay URLs section */}
        <div className="space-y-3">
          <div className="flex items-center">
            <h3 className="text-blue-300 text-sm font-medium">Relay URLs</h3>
            <span title="You must be connected to at least one relay to communicate with other signers. Ensure all signers have at least one common relay to coordinate successfully.">
              <HelpCircle size={16} className="ml-2 text-blue-400 cursor-help" />
            </span>
          </div>
          <div className="flex">
            <Input
              type="text"
              placeholder="Add relay URL"
              value={newRelayUrl}
              onChange={(e) => setNewRelayUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddRelay()}
              className="bg-gray-800/50 border-gray-700/50 text-blue-300 py-2 text-sm w-full"
              disabled={isSignerRunning || isConnecting}
            />
            <Button
              onClick={handleAddRelay}
              className="ml-2 bg-blue-800/30 text-blue-400 hover:text-blue-300 hover:bg-blue-800/50"
              disabled={!newRelayUrl.trim() || isSignerRunning || isConnecting}
            >
              Add
            </Button>
          </div>

          <div className="space-y-2">
            {relays.map((relay, index) => (
              <div key={index} className="flex justify-between items-center bg-gray-800/30 py-2 px-3 rounded-md">
                <span className="text-blue-300 text-sm font-mono">{relay}</span>
                <IconButton
                  variant="destructive"
                  size="sm"
                  icon={<X className="h-4 w-4" />}
                  onClick={() => handleRemoveRelay(relay)}
                  tooltip="Remove relay"
                  disabled={isSignerRunning || isConnecting || relays.length <= 1}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Peer List and Event Log - stacked vertically */}
        <div className="space-y-4">
          <PeerList
            peers={peers}
            onPing={handlePingPeer}
            onPolicyChange={handlePolicyChange}
            disabled={nodeStatus !== 'running'}
          />

          <EventLog
            entries={logs}
            onClear={() => setLogs([])}
          />
        </div>
      </div>

      <ConfirmModal
        isOpen={showClearModal}
        title="Clear All Credentials?"
        message="This will permanently delete your stored credentials from this browser. If you haven't backed up your group and share credentials, they will be lost forever. This action cannot be undone."
        confirmLabel="Clear Credentials"
        cancelLabel="Keep Credentials"
        onConfirm={handleClearCredentials}
        onCancel={() => setShowClearModal(false)}
        variant="danger"
      />
    </PageLayout>
  );
}
