import * as React from 'react';
import { cn } from '@/lib/utils';

type PageLayoutProps = React.HTMLAttributes<HTMLDivElement> & {
  maxWidth?: string; // e.g., "max-w-4xl"
  header?: React.ReactNode;
};

export function PageLayout({ className, maxWidth = 'max-w-3xl', header, children, ...props }: PageLayoutProps) {
  return (
    <div className={cn('min-h-screen p-4 sm:p-8 text-blue-100', className)} {...props}>
      <div className={cn('mx-auto flex w-full flex-col gap-6', maxWidth)}>
        {header}
        {children}
      </div>
    </div>
  );
}

