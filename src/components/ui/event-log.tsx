import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { LogEntryComponent, type LogEntryData } from '@/components/ui/log-entry';

export type LogEntry = LogEntryData;

export function EventLog({ entries, onClear }: { entries: LogEntry[]; onClear?: () => void }) {
  const [collapsed, setCollapsed] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current && !collapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, collapsed]);

  return (
    <div className="border border-blue-900/30 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/30">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex-1 flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          {collapsed ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
          <span className="text-blue-300 font-medium">Event Log</span>
          <div className={cn(
            'w-2 h-2 rounded-full',
            entries.length > 0 ? 'bg-green-500' : 'bg-gray-500'
          )} />
          <span className="text-xs text-gray-400 bg-gray-500/20 px-2 py-0.5 rounded">
            {entries.length} events
          </span>
          <span className="text-xs text-gray-400">
            {collapsed ? 'Click to expand' : 'Click to collapse'}
          </span>
        </button>
        {onClear && entries.length > 0 && (
          <IconButton
            variant="ghost"
            size="sm"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={onClear}
            tooltip="Clear log"
            className="text-gray-400 hover:text-red-400"
          />
        )}
      </div>

      {/* Content */}
      {!collapsed && (
        <div ref={scrollRef} className="p-3 max-h-[280px] space-y-2 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="text-center text-gray-500 py-4 text-sm">No events yet</p>
          ) : (
            entries.map((entry) => (
              <LogEntryComponent key={entry.id} log={entry} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
