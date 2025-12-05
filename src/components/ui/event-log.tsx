import * as React from 'react';
import { cn } from '@/lib/utils';

export type LogEntry = { time: string; level: string; message: string; detail?: string };

const levelColors: Record<string, string> = {
  READY: 'text-green-400',
  INFO: 'text-blue-400',
  ERROR: 'text-red-400',
  SIGN: 'text-cyan-400',
  ECDH: 'text-purple-400',
  PING: 'text-yellow-400'
};

export function EventLog({ entries, onClear }: { entries: LogEntry[]; onClear?: () => void }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div className="flex flex-col">
      <div ref={scrollRef} className="max-h-[300px] space-y-2 overflow-y-auto text-sm">
        {entries.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No events yet</p>
        ) : (
          entries.map((entry, idx) => (
            <div
              key={`${entry.time}-${idx}`}
              className="rounded-md border border-blue-900/30 bg-gray-800/30 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-gray-500">{entry.time}</span>
                <span className={cn('text-xs font-medium', levelColors[entry.level] || 'text-gray-400')}>
                  {entry.level}
                </span>
              </div>
              <p className="mt-1 text-blue-100 text-sm">{entry.message}</p>
              {entry.detail && <p className="mt-1 text-xs text-gray-400 font-mono truncate">{entry.detail}</p>}
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-blue-900/20">
        <span>{entries.length} events</span>
        {onClear && entries.length > 0 && (
          <button className="text-blue-400 hover:text-blue-300 transition-colors" onClick={onClear} type="button">
            Clear log
          </button>
        )}
      </div>
    </div>
  );
}

