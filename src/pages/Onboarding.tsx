import * as React from 'react';
import type { GroupPackage } from '@frostr/igloo-core';
import { PageLayout } from '@/components/ui/page-layout';
import { AppHeader } from '@/components/ui/app-header';
import { ContentCard } from '@/components/ui/content-card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { useStore } from '@/lib/store';
import { Eye, EyeOff } from 'lucide-react';
import {
  DEFAULT_RELAYS,
  getCredentialDiagnostics,
  normalizeRelays,
  validateGroupCredential,
  validateShareCredential
} from '@/lib/igloo';

export default function OnboardingPage() {
  const { saveNewShare } = useStore();
  const [group, setGroup] = React.useState('');
  const [share, setShare] = React.useState('');
  const [showShare, setShowShare] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [relays, setRelays] = React.useState<string>(DEFAULT_RELAYS.join('\n'));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const groupValidation = React.useMemo(() => validateGroupCredential(group), [group]);
  const groupDecoded = groupValidation.decoded as GroupPackage | undefined;
  const shareValidation = React.useMemo(() => validateShareCredential(share, groupDecoded), [share, groupDecoded]);
  const relayInput = React.useMemo(() => relays.split(/\s+/).filter(Boolean), [relays]);
  const relayState = React.useMemo(() => normalizeRelays(relayInput), [relayInput]);
  const diagnostics = React.useMemo(
    () => getCredentialDiagnostics(groupValidation.isValid ? group.trim() : undefined, shareValidation.isValid ? share.trim() : undefined),
    [group, share, groupValidation.isValid, shareValidation.isValid]
  );

  const canSave = groupValidation.isValid && shareValidation.isValid && password.trim().length >= 6 && relayState.relays.length > 0;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveNewShare(password, { group: group.trim(), share: share.trim(), relays: relayState.relays });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageLayout header={<AppHeader subtitle="Web Signer" title="Igloo" />}>
      <ContentCard title="Add Share" description="Validate your credentials with igloo-core before encrypting them locally.">
        <form onSubmit={onSave} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm text-blue-300">Group Credential</Label>
            <Textarea placeholder="bfgroup1…" value={group} onChange={(e) => setGroup(e.target.value)} rows={3} required />
            {!groupValidation.isValid && group && <p className="text-xs text-red-400">{groupValidation.error}</p>}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-blue-300">Share Credential</Label>
              <IconButton
                variant="ghost"
                size="sm"
                icon={showShare ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                onClick={() => setShowShare(!showShare)}
                tooltip={showShare ? 'Hide share' : 'Show share'}
                className="text-gray-500 hover:text-blue-300"
              />
            </div>
            <div className="relative">
              {showShare ? (
                <Textarea placeholder="bfshare1…" value={share} onChange={(e) => setShare(e.target.value)} rows={3} required />
              ) : (
                <Input
                  type="password"
                  placeholder="bfshare1…"
                  value={share}
                  onChange={(e) => setShare(e.target.value)}
                  className="font-mono"
                  required
                />
              )}
            </div>
            {!shareValidation.isValid && share && <p className="text-xs text-red-400">{shareValidation.error}</p>}
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-blue-300">Relays (one per line)</Label>
              <Textarea value={relays} onChange={(e) => setRelays(e.target.value)} rows={3} />
              {relayState.errors.length > 0 && <p className="text-xs text-yellow-400">{relayState.errors[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-blue-300">Encryption Password</Label>
              <Input type="password" placeholder="Choose a password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <p className="text-xs text-gray-500">Used only to encrypt/decrypt locally; never sent anywhere.</p>
            </div>
          </div>
          {diagnostics.summary && (
            <div className="rounded-md border border-blue-900/30 bg-gray-800/30 p-4 text-sm">
              <p className="font-medium text-blue-100">Share #{diagnostics.summary.idx}</p>
              <p className="text-xs text-gray-400 mt-1">Threshold {diagnostics.summary.threshold}/{diagnostics.summary.totalMembers}</p>
              {diagnostics.summary.pubkey && <p className="text-xs text-gray-400 font-mono">Pubkey {diagnostics.summary.pubkey.slice(0, 16)}…</p>}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={!canSave || saving} className="min-w-[160px]">
              {saving ? 'Saving…' : 'Save and Continue'}
            </Button>
          </div>
        </form>
      </ContentCard>
    </PageLayout>
  );
}
