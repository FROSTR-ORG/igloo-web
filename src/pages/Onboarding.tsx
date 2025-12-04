import * as React from 'react';
import type { GroupPackage } from '@frostr/igloo-core';
import { PageLayout } from '@/components/ui/page-layout';
import { AppHeader } from '@/components/ui/app-header';
import { ContentCard } from '@/components/ui/content-card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
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
    <PageLayout header={<AppHeader subtitle="Onboarding" title="Add Your Share" />}>
      <ContentCard title="Add Share" description="Validate your credentials with igloo-core before encrypting them locally.">
        <form onSubmit={onSave} className="space-y-5">
          <div className="space-y-2">
            <Label>Group credential</Label>
            <Textarea placeholder="bfgroup1…" value={group} onChange={(e) => setGroup(e.target.value)} rows={3} required />
            {!groupValidation.isValid && group && <p className="text-xs text-red-400">{groupValidation.error}</p>}
          </div>
          <div className="space-y-2">
            <Label>Share credential</Label>
            <Textarea placeholder="bfshare1…" value={share} onChange={(e) => setShare(e.target.value)} rows={3} required />
            {!shareValidation.isValid && share && <p className="text-xs text-red-400">{shareValidation.error}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Relays (one per line)</Label>
              <Textarea value={relays} onChange={(e) => setRelays(e.target.value)} rows={3} />
              {relayState.errors.length > 0 && <p className="text-xs text-amber-300">{relayState.errors[0]}</p>}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Encryption password</Label>
              <Input type="password" placeholder="Choose a password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <p className="text-xs text-blue-300/70">Used only to encrypt/decrypt locally; never sent anywhere.</p>
            </div>
          </div>
          {diagnostics.summary && (
            <div className="rounded-lg border border-blue-900/30 bg-black/20 p-4 text-sm text-blue-200">
              <p className="font-semibold">Share #{diagnostics.summary.idx}</p>
              <p className="text-xs text-blue-300/70">Threshold {diagnostics.summary.threshold}/{diagnostics.summary.totalMembers}</p>
              {diagnostics.summary.pubkey && <p className="text-xs text-blue-300/70">Pubkey {diagnostics.summary.pubkey.slice(0, 16)}…</p>}
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={!canSave || saving} className="min-w-[160px]">{saving ? 'Saving…' : 'Save and Continue'}</Button>
          </div>
        </form>
      </ContentCard>
    </PageLayout>
  );
}
