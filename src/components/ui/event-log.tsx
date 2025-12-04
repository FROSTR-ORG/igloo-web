import * as React from 'react';

export type LogEntry = { time: string; level: string; message: string; detail?: string };

export function EventLog({ entries, onClear }: { entries: LogEntry[]; onClear?: () => void }) {
  return (
    <div>
      <div className="space-y-3 text-sm">
        {entries.map((entry) => (
          <div key={entry.time + entry.level + entry.message} className="rounded-lg border border-blue-900/40 bg-black/25 p-4">
            <div className="flex items-center justify-between text-xs text-blue-200/70">
              <span className="font-mono">{entry.time}</span>
              <span className="uppercase tracking-[0.3em] text-blue-400">{entry.level}</span>
            </div>
            <p className="mt-2 text-blue-50">{entry.message}</p>
            {entry.detail && <p className="text-xs text-blue-200/70">{entry.detail}</p>}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-blue-200/70">
        <span>Auto-prune after 200 entries</span>
        {onClear && (
          <button className="text-blue-400 hover:text-blue-200" onClick={onClear} type="button">
            Clear log
          </button>
        )}
      </div>
    </div>
  );
}

