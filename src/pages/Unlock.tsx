import * as React from 'react';
import { PageLayout } from '@/components/ui/page-layout';
import { AppHeader } from '@/components/ui/app-header';
import { ContentCard } from '@/components/ui/content-card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';

export default function UnlockPage() {
  const { unlock } = useStore();
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await unlock(password);
    } catch (err) {
      setError('Invalid password or corrupted data');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout header={<AppHeader subtitle="Web Signer" title="Igloo" />}>
      <ContentCard title="Unlock Saved Share" description="Enter your password to decrypt the saved credentials in this browser.">
        <form onSubmit={onUnlock} className="space-y-5">
          <div className="space-y-2 max-w-sm">
            <Label className="text-sm text-blue-300">Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" required />
          </div>
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
          <div className="flex justify-end">
            <Button type="submit" className="min-w-[140px]">{loading ? 'Unlocking…' : 'Unlock'}</Button>
          </div>
        </form>
      </ContentCard>
    </PageLayout>
  );
}

