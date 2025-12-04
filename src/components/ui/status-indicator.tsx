import { clsx } from 'clsx';

export type StatusState = 'online' | 'warning' | 'offline';

export function StatusDot({ state, className }: { state: StatusState; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex h-2.5 w-2.5 rounded-full',
        state === 'online' && 'bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.65)]',
        state === 'warning' && 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.55)]',
        state === 'offline' && 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]',
        className
      )}
    />
  );
}

