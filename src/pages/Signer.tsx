import * as React from 'react';
import { PageLayout } from '@/components/ui/page-layout';
import { AppHeader } from '@/components/ui/app-header';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { PeerList, type PeerPolicy } from '@/components/ui/peer-list';
import { EventLog, type LogEntry } from '@/components/ui/event-log';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Check, Copy, HelpCircle, Trash2, User, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import {
  DEFAULT_RELAYS,
  createSignerNode,
  connectSignerNode,
  detachEvent,
  normalizeRelays,
  pingSinglePeer,
  refreshPeerStatuses,
  setPeerPolicy,
  stopSignerNode,
  type NodeWithEvents
} from '@/lib/igloo';
import { loadPeerPolicies, savePeerPolicies } from '@/lib/storage';

const MAX_LOGS = 200;

const EVENT_LABELS: Record<string, { level: string; message: string }> = {
  ready: { level: 'READY', message: 'Node is ready' },
  closed: { level: 'INFO', message: 'Node closed connection' },
  error: { level: 'ERROR', message: 'Node error' }
};

function initializePeers(): PeerPolicy[] {
  const savedPolicies = loadPeerPolicies();
  return savedPolicies.map((saved, index) => ({
    alias: `Peer ${index + 1}`,
    pubkey: saved.pubkey,
    send: saved.send,
    receive: saved.receive,
    state: 'offline'
  }));
}

function readTag(msg: unknown): string {
  if (msg && typeof msg === 'object' && 'tag' in msg && typeof msg.tag === 'string') {
    return msg.tag;
  }
  return 'message';
}

export default function SignerPage() {
  const { profile, logout, activeNode, setActiveNode } = useStore();
  const [copiedOnboard, setCopiedOnboard] = React.useState(false);
  const [relays, setRelays] = React.useState<string[]>(
    profile?.relays?.length ? profile.relays : DEFAULT_RELAYS
  );
  const [newRelayUrl, setNewRelayUrl] = React.useState('');
  const [peers, setPeers] = React.useState<PeerPolicy[]>(initializePeers);
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [nodeStatus, setNodeStatus] = React.useState<'stopped' | 'connecting' | 'running'>('stopped');
  const [nodeError, setNodeError] = React.useState<string | null>(null);
  const [showClearModal, setShowClearModal] = React.useState(false);
  const nodeRef = React.useRef<NodeWithEvents | null>(null);
  const cleanupRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    setRelays(profile?.relays?.length ? profile.relays : DEFAULT_RELAYS);
    setPeers(initializePeers());
    setNodeError(null);
    setLogs([]);

    if (!profile) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      stopSignerNode(nodeRef.current);
      nodeRef.current = null;
      setActiveNode(null);
      setNodeStatus('stopped');
    }
  }, [profile, setActiveNode]);

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

      const handleMessage = (msg: unknown) => {
        const tag = readTag(msg);

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
        } else if (tag.startsWith('/onboard/')) {
          addLog('ONBOARD', `Onboard event ${tag}`, msg);
        } else {
          addLog('INFO', 'Bridge event', msg);
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

  React.useEffect(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!activeNode) {
      nodeRef.current = null;
      if (profile) {
        setNodeStatus('stopped');
      }
      return;
    }

    nodeRef.current = activeNode;
    cleanupRef.current = setupNodeListeners(activeNode);
    setNodeStatus('running');
    setNodeError(null);
    addLog('READY', 'Signer node connected');

    void refreshPeerStatuses(activeNode, initializePeers()).then(setPeers);

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [activeNode, addLog, profile, setupNodeListeners]);

  React.useEffect(() => {
    return () => {
      cleanupRef.current?.();
      stopSignerNode(nodeRef.current);
      nodeRef.current = null;
      setActiveNode(null);
    };
  }, [setActiveNode]);

  const refreshAllPeers = React.useCallback(async () => {
    if (!nodeRef.current) {
      addLog('INFO', 'Start the signer before refreshing peers');
      return;
    }

    const updated = await refreshPeerStatuses(nodeRef.current, peers);
    setPeers(updated);
  }, [addLog, peers]);

  const handleStart = async () => {
    if (!profile) return;

    const { relays: normalized, errors } = normalizeRelays(relays.length ? relays : DEFAULT_RELAYS);
    if (errors.length) {
      addLog('INFO', `Relay warnings: ${errors.join(', ')}`);
    }

    setRelays(normalized);
    setNodeStatus('connecting');

    try {
      const node = createSignerNode({
        onboardPackage: profile.onboardPackage,
        relays: normalized
      });

      cleanupRef.current?.();
      nodeRef.current = node;
      cleanupRef.current = setupNodeListeners(node);

      await connectSignerNode(node);

      setNodeStatus('running');
      setNodeError(null);
      setActiveNode(node);
      addLog('READY', 'Signer node ready');
      addLog('INFO', `Connected to ${normalized.length} relays`);

      const updatedPeers = await refreshPeerStatuses(node, peers);
      setPeers(updatedPeers);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Failed to start signer';
      const message =
        rawMessage.includes('Onboard response timed out')
          ? 'Onboarding timed out. Ensure demo relay/peer are running and your saved onboarding package matches the current demo keyset (Clear Profile and re-onboard if you regenerated keys).'
          : rawMessage;
      setNodeError(message);
      setNodeStatus('stopped');
      addLog('ERROR', 'Failed to start signer', message);
      stopSignerNode(nodeRef.current);
      nodeRef.current = null;
      setActiveNode(null);
    }
  };

  const handleStop = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    stopSignerNode(nodeRef.current);
    nodeRef.current = null;
    setActiveNode(null);
    setNodeStatus('stopped');
    addLog('INFO', 'Signer stopped');
  };

  const handlePingPeer = React.useCallback(
    async (pubkey: string) => {
      if (!nodeRef.current) {
        addLog('INFO', 'Start the signer before pinging peers');
        return { success: false };
      }

      const peerAlias = peers.find((p) => p.pubkey === pubkey)?.alias || 'Peer';
      addLog('PING', `Pinging ${peerAlias}...`);
      const result = await pingSinglePeer(nodeRef.current, pubkey);

      setPeers((prev) =>
        prev.map((p) =>
          p.pubkey === pubkey
            ? { ...p, state: result.success ? 'online' : 'offline' }
            : p
        )
      );

      if (result.success) {
        addLog('PING', `${peerAlias} responded${result.latency ? ` in ${result.latency}ms` : ''}`);
      } else {
        addLog('PING', `${peerAlias} did not respond${result.error ? `: ${result.error}` : ''}`);
      }

      return result;
    },
    [addLog, peers]
  );

  const handlePolicyChange = React.useCallback(
    (pubkey: string, field: 'send' | 'receive', value: boolean) => {
      const peerAlias = peers.find((p) => p.pubkey === pubkey)?.alias || 'Peer';

      setPeers((prev) => {
        const updated = prev.map((p) => (p.pubkey === pubkey ? { ...p, [field]: value } : p));
        savePeerPolicies(
          updated.map((p) => ({ pubkey: p.pubkey, send: p.send, receive: p.receive }))
        );
        return updated;
      });

      addLog('INFO', `${peerAlias} ${field} policy set to ${value ? 'allow' : 'deny'}`);

      if (nodeRef.current && nodeStatus === 'running') {
        const current = peers.find((p) => p.pubkey === pubkey);
        const next = {
          send: field === 'send' ? value : (current?.send ?? true),
          receive: field === 'receive' ? value : (current?.receive ?? true)
        };

        void setPeerPolicy(nodeRef.current, pubkey, next)
          .then(() => {
            addLog('INFO', `${peerAlias} backend policy updated`);
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            addLog('WARN', `${peerAlias} backend policy update failed`, message);
          });
      }
    },
    [addLog, nodeStatus, peers]
  );

  const handleCopyOnboard = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(profile.onboardPackage);
      setCopiedOnboard(true);
      setTimeout(() => setCopiedOnboard(false), 2000);
    } catch (err) {
      console.error('Failed to copy onboarding package', err);
    }
  };

  const handleAddRelay = () => {
    if (newRelayUrl && !relays.includes(newRelayUrl)) {
      setRelays([...relays, newRelayUrl]);
      setNewRelayUrl('');
    }
  };

  const handleRemoveRelay = (urlToRemove: string) => {
    setRelays(relays.filter((url) => url !== urlToRemove));
  };

  const isSignerRunning = nodeStatus === 'running';
  const isConnecting = nodeStatus === 'connecting';
  const canStart = profile && relays.length > 0;

  const handleClearProfile = () => {
    setShowClearModal(false);
    logout();
  };

  if (!profile) {
    return (
      <PageLayout header={<AppHeader title="igloo web" />}>
        <div className="border border-blue-800/30 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-blue-300 mb-2">No onboarding profile</h2>
          <p className="text-gray-400 text-sm mb-4">
            Complete v2 onboarding to configure this signer.
          </p>
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
              Clear Profile
            </Button>
          }
        />
      }
    >
      <div className="space-y-6">
        <div className="flex items-center">
          <h2 className="text-blue-300 text-lg">Start your signer to handle requests</h2>
          <span title="The signer must be running to handle request rounds through your configured relays.">
            <HelpCircle size={18} className="ml-2 text-blue-400 cursor-help" />
          </span>
        </div>

        <div className="border border-blue-800/30 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-400" />
            <span className="text-blue-200 font-medium">{profile.keysetName || 'Unnamed signer'}</span>
          </div>

          <div className="space-y-1.5">
            <LabelRow label="Onboarding Package" />
            <div className="flex">
              <Input
                type="text"
                value={profile.onboardPackage}
                className="bg-gray-800/50 border-gray-700/50 text-blue-300 py-2 text-sm w-full font-mono"
                readOnly
                disabled={isSignerRunning || isConnecting}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyOnboard}
                className="ml-2 bg-blue-800/30 text-blue-400 hover:text-blue-300 hover:bg-blue-800/50"
                title="Copy onboarding package"
              >
                {copiedOnboard ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  isSignerRunning
                    ? 'bg-green-500 pulse-animation'
                    : isConnecting
                      ? 'bg-yellow-500 pulse-animation-yellow'
                      : 'bg-red-500'
                }`}
              />
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

        <div className="space-y-3">
          <div className="flex items-center">
            <h3 className="text-blue-300 text-sm font-medium">Relay URLs</h3>
            <span title="Ensure all participating signers share at least one common relay.">
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

        <div className="space-y-4">
          <PeerList
            peers={peers}
            onPing={handlePingPeer}
            onPolicyChange={handlePolicyChange}
            onRefreshAll={refreshAllPeers}
            disabled={nodeStatus !== 'running'}
          />

          <EventLog entries={logs} onClear={() => setLogs([])} />
        </div>
      </div>

      <ConfirmModal
        isOpen={showClearModal}
        title="Clear Onboarding Profile?"
        message="This will delete your saved onboarding package and relay configuration from this browser. This action cannot be undone."
        confirmLabel="Clear Profile"
        cancelLabel="Keep Profile"
        onConfirm={handleClearProfile}
        onCancel={() => setShowClearModal(false)}
        variant="danger"
      />
    </PageLayout>
  );
}

function LabelRow({ label }: { label: string }) {
  return <div className="text-xs text-gray-400 font-medium">{label}</div>;
}
