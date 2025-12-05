import * as React from 'react';
import { cn } from '@/lib/utils';

type AppHeaderProps = {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
};

export function AppHeader({ title = 'Igloo', subtitle, right, className }: AppHeaderProps) {
  return (
    <header className={cn('mb-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/30">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-7 w-7 text-blue-400"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3L4 7.5v9L12 21l8-4.5v-9L12 3z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 12l8-4.5M12 12v9M12 12L4 7.5"
              />
            </svg>
          </div>
          {/* Title block */}
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-300 via-blue-200 to-cyan-300 bg-clip-text text-transparent">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-blue-400/80">{subtitle}</p>
            )}
          </div>
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
    </header>
  );
}

