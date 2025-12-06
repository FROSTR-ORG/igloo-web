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
import { OnboardingInstructions } from '@/components/OnboardingInstructions';
import {
  DEFAULT_RELAYS,
  getCredentialDiagnostics,
  normalizeRelays,
  validateGroupCredential,
  validateShareCredential
} from '@/lib/igloo';
import { cn } from '@/lib/utils';

type OnboardingStep = 'instructions' | 'setup';

// Step indicator component
function StepIndicator({ currentStep }: { currentStep: OnboardingStep }) {
  const steps = [
    { key: 'instructions', label: 'Welcome' },
    { key: 'setup', label: 'Setup' }
  ] as const;

  return (
    <div className="flex items-center justify-center space-x-2 mb-6">
      {steps.map((step, i) => {
        const isActive = step.key === currentStep;
        const isPast = steps.findIndex(s => s.key === currentStep) > i;
        return (
          <div key={step.key} className="flex items-center">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                isPast
                  ? 'bg-green-600/80 text-white'
                  : isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800/50 text-gray-500'
              )}
            >
              {isPast ? '✓' : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'w-8 h-0.5',
                  isPast ? 'bg-green-600/50' : 'bg-gray-700/50'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingPage() {
  const { saveNewShare } = useStore();
  const [step, setStep] = React.useState<OnboardingStep>('instructions');
  const [keysetName, setKeysetName] = React.useState('');
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

  const canSave = keysetName.trim().length > 0 && groupValidation.isValid && shareValidation.isValid && password.trim().length >= 6 && relayState.relays.length > 0;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveNewShare(password, { group: group.trim(), share: share.trim(), relays: relayState.relays, keysetName: keysetName.trim() });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageLayout header={<AppHeader title="igloo web" />}>
      <ContentCard
        title={step === 'instructions' ? undefined : 'Add Share'}
        description={step === 'instructions' ? undefined : 'Validate credentials with igloo-core before encrypting locally'}
      >
        <StepIndicator currentStep={step} />

        {step === 'instructions' && (
          <OnboardingInstructions onContinue={() => setStep('setup')} />
        )}

        {step === 'setup' && (
          <form onSubmit={onSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm text-blue-300">Keyset Name</Label>
              <Input
                type="text"
                placeholder="e.g. My FROSTR Keyset, Work Signing Key..."
                value={keysetName}
                onChange={(e) => setKeysetName(e.target.value)}
                required
              />
              <p className="text-xs text-gray-500">A friendly name to help you identify this keyset</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-blue-300">Group Credential</Label>
              <Textarea placeholder="bfgroup1…" value={group} onChange={(e) => setGroup(e.target.value)} rows={2} className="text-sm font-mono" required />
              {!groupValidation.isValid && group && <p className="text-xs text-red-400">{groupValidation.error}</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-blue-300">Share Credential</Label>
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={showShare ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  onClick={() => setShowShare(!showShare)}
                  tooltip={showShare ? 'Hide' : 'Show'}
                  className="text-gray-500 hover:text-blue-300"
                />
              </div>
              {showShare ? (
                <Textarea placeholder="bfshare1…" value={share} onChange={(e) => setShare(e.target.value)} rows={2} className="text-sm font-mono" required />
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
              {!shareValidation.isValid && share && <p className="text-xs text-red-400">{shareValidation.error}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-blue-300">Relays</Label>
              <Textarea value={relays} onChange={(e) => setRelays(e.target.value)} rows={2} className="text-sm font-mono" placeholder="wss://relay.example.com" />
              {relayState.errors.length > 0 && <p className="text-xs text-yellow-400">{relayState.errors[0]}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-blue-300">Encryption Password</Label>
              <Input type="password" placeholder="Choose a password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <p className="text-xs text-gray-500">Used only to encrypt/decrypt locally</p>
            </div>
            {diagnostics.summary && (
              <div className="rounded border border-green-500/20 bg-green-500/5 px-3 py-2.5 text-sm">
                <p className="font-medium text-green-400">Share #{diagnostics.summary.idx}</p>
                <p className="text-xs text-gray-400 mt-0.5">Threshold {diagnostics.summary.threshold}/{diagnostics.summary.totalMembers}</p>
              </div>
            )}
            {error && (
              <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={!canSave || saving}>
                {saving ? 'Saving…' : 'Save and Continue'}
              </Button>
            </div>
          </form>
        )}
      </ContentCard>
    </PageLayout>
  );
}
