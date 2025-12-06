import * as React from 'react';
import { cn } from '@/lib/utils';
import frostrLogo from '@/assets/frostr-logo-transparent.png';

type AppHeaderProps = {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
};

export function AppHeader({ title = 'igloo', subtitle, right, className }: AppHeaderProps) {
  return (
    <header className={cn('mb-6', className)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Frostr Logo */}
          <img
            src={frostrLogo}
            alt="Frostr"
            className="h-11 w-11 object-contain"
          />
          {/* Title block */}
          <div>
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-300 via-blue-200 to-cyan-300 bg-clip-text text-transparent">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
    </header>
  );
}

