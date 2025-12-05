import { cn } from '@/lib/utils';

export type StatusState = 'online' | 'warning' | 'offline' | 'idle';

export function StatusDot({ state, className, size = 'default' }: { state: StatusState; className?: string; size?: 'sm' | 'default' }) {
  const sizeClass = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  return (
    <span
      className={cn(
        'inline-flex rounded-full',
        sizeClass,
        state === 'online' && 'bg-green-500',
        state === 'warning' && 'bg-yellow-500',
        state === 'offline' && 'bg-red-500',
        state === 'idle' && 'bg-gray-500',
        className
      )}
    />
  );
}

export function StatusBadge({
  state,
  label,
  className
}: {
  state: StatusState;
  label?: string;
  className?: string;
}) {
  const stateLabel = label ?? state;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        state === 'online' && 'bg-green-500/20 text-green-400 ring-green-500/30',
        state === 'warning' && 'bg-yellow-500/20 text-yellow-400 ring-yellow-500/30',
        state === 'offline' && 'bg-red-500/20 text-red-400 ring-red-500/30',
        state === 'idle' && 'bg-gray-500/20 text-gray-400 ring-gray-500/30',
        className
      )}
    >
      <StatusDot state={state} size="sm" />
      <span className="capitalize">{stateLabel}</span>
    </span>
  );
}

