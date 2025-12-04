import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

type AppHeaderProps = {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
};

export function AppHeader({ title = 'Igloo Web', subtitle, right, className }: AppHeaderProps) {
  return (
    <header className={cn('space-y-3', className)}>
      <p className="text-xs uppercase tracking-[0.55em] text-blue-400">{subtitle ?? 'Remote Signer'}</p>
      <div className="flex flex-wrap items-center gap-3 text-blue-100">
        <ShieldCheck className="h-6 w-6 text-blue-400" />
        <h1 className="text-3xl font-semibold">{title}</h1>
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}

