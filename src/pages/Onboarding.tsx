import * as React from 'react';
import { PageLayout } from '@/components/ui/page-layout';
import { AppHeader } from '@/components/ui/app-header';
import { ContentCard } from '@/components/ui/content-card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import { OnboardingInstructions } from '@/components/OnboardingInstructions';
import { DEFAULT_RELAYS, normalizeRelays, validateOnboardCredential } from '@/lib/igloo';
import { cn } from '@/lib/utils';

type OnboardingStep = 'instructions' | 'setup';

function StepIndicator({ currentStep }: { currentStep: OnboardingStep }) {
  const steps = [
    { key: 'instructions', label: 'Welcome' },
    { key: 'setup', label: 'Setup' }
  ] as const;

  return (
    <div className="flex items-center justify-center space-x-2 mb-6">
      {steps.map((step, i) => {
        const isActive = step.key === currentStep;
        const isPast = steps.findIndex((s) => s.key === currentStep) > i;
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
              <div className={cn('w-8 h-0.5', isPast ? 'bg-green-600/50' : 'bg-gray-700/50')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingPage() {
  const { connectOnboarding } = useStore();
  const [step, setStep] = React.useState<OnboardingStep>('instructions');
  const [keysetName, setKeysetName] = React.useState('');
  const [onboardPackage, setOnboardPackage] = React.useState('');
  const [relays, setRelays] = React.useState<string>(DEFAULT_RELAYS.join('\n'));
  const [connecting, setConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [diagnostics, setDiagnostics] = React.useState<{
    relays: string[];
    onboardLength: number;
  } | null>(null);

  const onboardValidation = React.useMemo(
    () => validateOnboardCredential(onboardPackage),
    [onboardPackage]
  );
  const relayInput = React.useMemo(() => relays.split(/\s+/).filter(Boolean), [relays]);
  const relayState = React.useMemo(() => normalizeRelays(relayInput), [relayInput]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const onboard = params.get('onboard');
    if (!onboard) return;
    setOnboardPackage(onboard.trim());
    setStep('setup');
  }, []);

  const canConnect =
    keysetName.trim().length > 0 &&
    onboardValidation.isValid &&
    relayState.relays.length > 0;

  async function onConnect(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setError(null);
    setDiagnostics({
      relays: relayState.relays,
      onboardLength: onboardPackage.trim().length
    });
    try {
      await connectOnboarding({
        keysetName: keysetName.trim(),
        onboardPackage: onboardPackage.trim(),
        relays: relayState.relays
      });
    } catch (err) {
      const raw =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
              ? err.message
              : 'Failed to connect onboarding';
      const message =
        raw.includes('Onboard response timed out')
          ? 'Connection timed out waiting for peer onboarding response. Confirm relay + peer are running and that this onboarding package matches the current demo keyset.'
          : raw;
      setError(message);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <PageLayout header={<AppHeader title="igloo web" />}>
      <ContentCard
        title={step === 'instructions' ? undefined : 'Add v2 Onboarding Package'}
        description={
          step === 'instructions'
            ? undefined
            : 'Paste bfonboard package and configure relay endpoints'
        }
      >
        <StepIndicator currentStep={step} />

        {step === 'instructions' && (
          <OnboardingInstructions onContinue={() => setStep('setup')} />
        )}

        {step === 'setup' && (
          <form onSubmit={onConnect} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm text-blue-300">Signer Name</Label>
              <Input
                type="text"
                placeholder="e.g. Laptop Signer, Browser Node A"
                value={keysetName}
                onChange={(e) => setKeysetName(e.target.value)}
                disabled={connecting}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-blue-300">Onboarding Package</Label>
              <Textarea
                placeholder="bfonboard1..."
                value={onboardPackage}
                onChange={(e) => setOnboardPackage(e.target.value)}
                rows={3}
                className="text-sm font-mono"
                disabled={connecting}
                required
              />
              {!onboardValidation.isValid && onboardPackage && (
                <p className="text-xs text-red-400">{onboardValidation.error}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-blue-300">Relays</Label>
              <Textarea
                value={relays}
                onChange={(e) => setRelays(e.target.value)}
                rows={3}
                className="text-sm font-mono"
                placeholder="wss://relay.example.com"
                disabled={connecting}
              />
              {relayState.errors.length > 0 && (
                <p className="text-xs text-yellow-400">{relayState.errors[0]}</p>
              )}
            </div>

            {error && (
              <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            {(connecting || diagnostics) && (
              <div className="rounded border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-200 space-y-1">
                <div>Connection diagnostics</div>
                <div>Onboarding length: {diagnostics?.onboardLength ?? onboardPackage.trim().length}</div>
                <div>Relays: {(diagnostics?.relays ?? relayState.relays).join(', ')}</div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={!canConnect || connecting}>
                {connecting ? 'Connecting…' : 'Connect and Continue'}
              </Button>
            </div>
          </form>
        )}
      </ContentCard>
    </PageLayout>
  );
}
