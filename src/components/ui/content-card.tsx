import * as React from 'react';
import { cn } from '@/lib/utils';

type ContentCardProps = {
  title?: string;
  description?: string;
  action?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export function ContentCard({ title, description, action, className, children, ...props }: ContentCardProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-blue-900/30 bg-gray-900/40 p-4 sm:p-6 shadow-lg backdrop-blur-sm',
        className
      )}
      {...props}
    >
      {(title || description || action) && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title && <h2 className="text-xl font-semibold text-blue-300">{title}</h2>}
            {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
          </div>
          {action && <div className="text-sm text-blue-400">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

