import * as React from 'react';
import { ChevronRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LogEntryData {
  time: string;
  level: string;
  message: string;
  data?: unknown;
  id: string;
}

const levelColors: Record<string, string> = {
  READY: 'text-green-400',
  INFO: 'text-blue-400',
  ERROR: 'text-red-400',
  SIGN: 'text-cyan-400',
  ECDH: 'text-purple-400',
  PING: 'text-yellow-400'
};

export function LogEntryComponent({ log }: { log: LogEntryData }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const hasData = log.data !== undefined && log.data !== null;

  const handleClick = React.useCallback(() => {
    if (hasData) {
      setIsExpanded((prev) => !prev);
    }
  }, [hasData]);

  const formattedData = React.useMemo(() => {
    if (!hasData) return null;
    try {
      return JSON.stringify(log.data, null, 2);
    } catch (error) {
      // Handle circular references or non-serializable objects
      try {
        const dataType = typeof log.data;
        const isArray = Array.isArray(log.data);
        const constructorName = (log.data as object)?.constructor?.name;

        let preview = '';
        if (dataType === 'object' && log.data !== null) {
          try {
            const keys = Object.keys(log.data as object);
            preview = `Object with keys: [${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}]`;
          } catch {
            preview = `${constructorName || 'Object'} (non-enumerable)`;
          }
        } else {
          preview = `${dataType}: ${String(log.data).slice(0, 100)}${String(log.data).length > 100 ? '...' : ''}`;
        }

        return `Unable to serialize data to JSON
Type: ${isArray ? 'Array' : dataType}${constructorName ? ` (${constructorName})` : ''}
Preview: ${preview}
Error: ${error instanceof Error ? error.message : 'Circular reference or non-serializable data'}`;
      } catch {
        return 'Error: Unable to format data';
      }
    }
  }, [log.data, hasData]);

  return (
    <div className="rounded-lg border border-blue-900/20 bg-gray-800/30 hover:bg-gray-800/50 transition-colors">
      <div
        className={cn(
          'px-3 py-2 flex items-start gap-2',
          hasData && 'cursor-pointer select-none'
        )}
        onClick={handleClick}
        role={hasData ? 'button' : undefined}
        tabIndex={hasData ? 0 : undefined}
        onKeyDown={
          hasData
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClick();
                }
              }
            : undefined
        }
      >
        {hasData ? (
          <div
            className="text-blue-400 transition-transform duration-200 mt-0.5 flex-shrink-0"
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </div>
        ) : (
          <div className="text-gray-600/50 mt-0.5 flex-shrink-0">
            <Info className="h-4 w-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-gray-500">{log.time}</span>
            <span
              className={cn(
                'text-[11px] font-medium',
                levelColors[log.level] || 'text-gray-400'
              )}
            >
              {log.level}
            </span>
          </div>
          <p className="text-blue-100 text-sm">{log.message}</p>
        </div>
      </div>
      {hasData && (
        <div
          className={cn(
            'transition-all duration-200 ease-in-out overflow-hidden',
            isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <pre className="mx-3 mb-3 text-xs bg-gray-900/50 p-2 rounded overflow-x-auto text-gray-400 shadow-inner">
            {formattedData}
          </pre>
        </div>
      )}
    </div>
  );
}
