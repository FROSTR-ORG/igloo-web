import { useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
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
  ShieldCheck,
  SignalHigh,
  SignalMedium,
  SignalZero,
  Users
} from 'lucide-react';

const shareSummary = {
  name: 'Vault A · Signer 03',
  index: 2,
  threshold: { current: 3, total: 5 },
  pubkey: 'npub1fe6asr4cl28vd48540k85turxms4er3vyj3weuv2v9yyqj8t99sqvt7u5s'
};

const credentials = {
  group: 'bfgroup1qp5ks4jup4z6nxxnvu90v66h3shx8a9e6zdprh53zxnuxn9t3awq35ecp4m5rkm7sglqs0d9g',
  share: 'bfshare1qrgjt4na94skjpnancp583huf7kj0n8vx6lcjc8f8acp77xkk6vuj9526zuqpz69rvq28qu'
};

const decodedGroup = {
  scheme: 'FROST2',
  totalShares: 5,
  threshold: 3,
  relaySet: ['relay.primal.net', 'relay.damus.io'],
  createdAt: '2024-09-12T14:03:09Z'
};

const decodedShare = {
  idx: 2,
  binder_sn: '8f2cb2af',
  hidden_sn: '54aa93d2',
  rev: '1.3.0',
  checksum: '6bdf-87c1'
};

type StatusState = 'online' | 'warning' | 'offline';

type RelayState = {
  url: string;
  latency: string;
  sync: string;
  state: StatusState;
};

type PeerPolicy = {
  alias: string;
  pubkey: string;
  send: boolean;
  receive: boolean;
  state: StatusState;
};

const relayRows: RelayState[] = [
  { url: 'wss://relay.primal.net', latency: '68 ms', sync: '99%', state: 'online' },
  { url: 'wss://relay.damus.io', latency: '102 ms', sync: '96%', state: 'warning' },
  { url: 'wss://relay.igloo.to', latency: '—', sync: '0%', state: 'offline' }
];

const peers: PeerPolicy[] = [
  { alias: 'Control Room', pubkey: 'npub1u7d0ncontrolroomy8lzprf8wc6n4c7zz8kgl39m3z4', send: true, receive: true, state: 'online' },
  { alias: 'Vault Ops', pubkey: 'npub1vaultops8dkgx7ncswkpnm9cwx4vpk8aszrvsmded5', send: true, receive: false, state: 'warning' },
  { alias: 'Cold Backup', pubkey: 'npub1coldbackupakp6ulx0ws3pf9dd742zqf2y5p9q5vse', send: false, receive: false, state: 'offline' }
];

const logEntries = [
  { time: '14:23:10', level: 'SIGN', message: 'Aggregated shares for tx 0x4ac9…b5d2', detail: 'Threshold met · 3 / 5' },
  { time: '14:18:02', level: 'PEER', message: 'Vault Ops toggled receive policy → deny', detail: 'Policy synced to 3 relays' },
  { time: '14:12:44', level: 'RELAY', message: 'relay.igloo.to unreachable', detail: 'Retry scheduled in 15s' },
  { time: '13:57:03', level: 'INFO', message: 'Signer keep-alive refreshed node', detail: 'Self pubkey npub1…vt7u loaded' }
];

const formatPubkey = (value: string) => `${value.slice(0, 10)}…${value.slice(-6)}`;

const StatusDot = ({ state }: { state: StatusState }) => (
  <span
    className={clsx(
      'inline-flex h-2.5 w-2.5 rounded-full',
      state === 'online' && 'bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.65)]',
      state === 'warning' && 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.55)]',
      state === 'offline' && 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]'
    )}
  />
);

type SectionCardProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
};

const SectionCard = ({ title, description, action, children }: SectionCardProps) => (
  <section className="rounded-xl border border-blue-900/30 bg-gray-900/40 p-6 shadow-[0_20px_40px_rgba(2,6,23,0.6)]">
    {(title || description || action) && (
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {title && <h3 className="text-lg font-semibold text-blue-200">{title}</h3>}
          {description && <p className="text-sm text-blue-300/70">{description}</p>}
        </div>
        {action && <div className="text-sm text-blue-300/80">{action}</div>}
      </div>
    )}
    {children}
  </section>
);

type CredentialFieldProps = {
  label: string;
  value: string;
  expanded: boolean;
  onToggle: () => void;
  decoded: Record<string, unknown>;
  status?: 'valid' | 'idle';
};

const CredentialField = ({ label, value, expanded, onToggle, decoded, status }: CredentialFieldProps) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-blue-300">
      <span>{label}</span>
      <div className="flex items-center gap-2 text-xs font-normal tracking-normal text-blue-200/80">
        {status === 'valid' && (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Validated
          </span>
        )}
        <span title="Match the credential exported from Igloo Desktop">
          <HelpCircle className="h-4 w-4 cursor-help text-blue-400" />
        </span>
      </div>
    </div>
    <textarea
      readOnly
      value={value}
      rows={3}
      className="w-full rounded-lg border border-blue-900/40 bg-gray-900/40 p-3 text-sm font-mono text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
    />
    <div className="flex gap-2 text-xs">
      <button type="button" className="igloo-button inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2">
        <Copy className="h-3.5 w-3.5" /> Copy
      </button>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-blue-900/40 px-3 py-2 text-blue-200 hover:border-blue-400/70 hover:text-blue-50"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Decoded
      </button>
    </div>
    {expanded && (
      <pre className="rounded-lg border border-blue-900/40 bg-black/40 p-3 text-[11px] font-mono leading-relaxed text-blue-100">
        {JSON.stringify(decoded, null, 2)}
      </pre>
    )}
  </div>
);

function App() {
  const [expanded, setExpanded] = useState({ group: false, share: false });
  const [isSignerRunning, setIsSignerRunning] = useState(true);

  const signerState: StatusState = isSignerRunning ? 'online' : 'offline';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-950/80 to-blue-950 px-4 py-10 text-blue-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.55em] text-blue-400">Igloo Desktop</p>
          <div className="flex flex-wrap items-center gap-3 text-blue-100">
            <ShieldCheck className="h-6 w-6 text-blue-400" />
            <h1 className="text-3xl font-semibold">Signer Control</h1>
          </div>
          <p className="text-sm text-blue-200/80">
            Mirror of the existing Igloo apps: permanently dark, blue accents, glass cards, and monospace data to manage shares, relays, and peer policies.
          </p>
        </header>

        <div className="flex items-center gap-2 text-blue-200">
          <h2 className="text-lg font-semibold text-blue-300">Start your signer to handle requests</h2>
          <span title="The signer must stay online to accept signature and ECDH requests.">
            <HelpCircle className="h-4 w-4 text-blue-400" />
          </span>
        </div>

        <div className="rounded-xl border border-blue-900/30 bg-gray-900/40 p-5 shadow-lg">
          <div className="flex flex-wrap items-center gap-3 text-sm text-blue-200/80">
            <Users className="h-5 w-5 text-blue-400" />
            <span className="font-medium text-blue-100">{shareSummary.name}</span>
            <span className="text-blue-300/70">• Share #{shareSummary.index}</span>
            <span className="text-blue-300/70">
              • Threshold {shareSummary.threshold.current}/{shareSummary.threshold.total}
            </span>
          </div>
          <div className="mt-3 text-xs text-blue-300">
            Pubkey
            <div className="mt-1 truncate font-mono text-blue-100">{shareSummary.pubkey}</div>
          </div>
        </div>

        <SectionCard title="Credentials" description="Paste exactly as exported from Igloo Desktop">
          <div className="grid gap-6 md:grid-cols-2">
            <CredentialField
              label="Group credential"
              value={credentials.group}
              decoded={decodedGroup}
              expanded={expanded.group}
              onToggle={() => setExpanded((prev) => ({ ...prev, group: !prev.group }))}
              status="valid"
            />
            <CredentialField
              label="Share credential"
              value={credentials.share}
              decoded={decodedShare}
              expanded={expanded.share}
              onToggle={() => setExpanded((prev) => ({ ...prev, share: !prev.share }))}
              status="valid"
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Signer engine"
          description="Local signer must remain active to service remote requests"
          action={
            <span className="inline-flex items-center gap-2 text-xs text-blue-200/80">
              <Activity className="h-3.5 w-3.5 text-cyan-300" /> Pulse 4.2s
            </span>
          }
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center gap-3 rounded-xl border border-blue-900/30 bg-blue-900/10 p-4">
              <StatusDot state={signerState} />
              <div>
                <p className="text-sm font-semibold text-blue-100">Signer {isSignerRunning ? 'Running' : 'Stopped'}</p>
                <p className="text-xs text-blue-200/70">Requires valid group + share + relay quorum</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsSignerRunning((prev) => !prev)}
                className={clsx(
                  'inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold shadow-lg transition-colors',
                  isSignerRunning
                    ? 'bg-rose-500/90 text-slate-950 hover:bg-rose-400'
                    : 'bg-emerald-500/90 text-slate-950 hover:bg-emerald-400'
                )}
              >
                {isSignerRunning ? <PauseCircle className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
                {isSignerRunning ? 'Stop signer' : 'Start signer'}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-900/40 bg-blue-900/10 px-5 py-3 text-sm text-blue-100 hover:border-blue-400/60"
              >
                <Radio className="h-5 w-5 text-cyan-300" />
                Test keep-alive
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Relay connectivity" description="All configured relays should be reachable before accepting requests">
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
                  <button className="rounded-full border border-blue-900/40 px-3 py-1 text-blue-200 hover:text-blue-50">Remove</button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Peer policies" description="Fine-grained send / receive rules per peer">
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
                    <div
                      className={clsx(
                        'rounded-md border px-3 py-2 text-center font-semibold',
                        peer.send ? 'border-emerald-500/40 text-emerald-300 bg-emerald-900/5' : 'border-rose-500/40 text-rose-300 bg-rose-900/5'
                      )}
                    >
                      send {peer.send ? 'allow' : 'deny'}
                    </div>
                    <div
                      className={clsx(
                        'rounded-md border px-3 py-2 text-center font-semibold',
                        peer.receive ? 'border-emerald-500/40 text-emerald-300 bg-emerald-900/5' : 'border-rose-500/40 text-rose-300 bg-rose-900/5'
                      )}
                    >
                      receive {peer.receive ? 'allow' : 'deny'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Event log" description="Chronological digest of signer activity">
            <div className="space-y-3 text-sm">
              {logEntries.map((entry) => (
                <div key={entry.time + entry.level} className="rounded-lg border border-blue-900/40 bg-black/25 p-4">
                  <div className="flex items-center justify-between text-xs text-blue-200/70">
                    <span className="font-mono">{entry.time}</span>
                    <span className="uppercase tracking-[0.3em] text-blue-400">{entry.level}</span>
                  </div>
                  <p className="mt-2 text-blue-50">{entry.message}</p>
                  <p className="text-xs text-blue-200/70">{entry.detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-blue-200/70">
              <span>Auto-prune after 200 entries</span>
              <button className="text-blue-400 hover:text-blue-200">Clear log</button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export default App;
