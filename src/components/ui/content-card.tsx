import * as React from 'react';
import { cn } from '@/lib/utils';

type ContentCardProps = {
  title?: string;
  description?: string;
  action?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export function ContentCard({ title, description, action, className, children, ...props }: ContentCardProps) {
  return (
    <section className={cn('igloo-card p-6', className)} {...props}>
      {(title || description || action) && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title && <h3 className="text-lg font-semibold text-blue-200">{title}</h3>}
            {description && <p className="text-sm text-blue-300/70">{description}</p>}
          </div>
          {action && <div className="text-sm text-blue-300/80">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

