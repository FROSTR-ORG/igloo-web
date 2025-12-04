import * as React from 'react';
import { validateRelayList } from '@frostr/igloo-core';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

type RelayInputProps = {
  relays: string[];
  onChange: (relays: string[]) => void;
};

export function RelayInput({ relays, onChange }: RelayInputProps) {
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  function add() {
    const v = value.trim();
    if (!v) return;
    try {
      const validation = validateRelayList([...relays, v]);
      if (validation.errors && validation.errors.length > 0) {
        setError(validation.errors[0]);
        return;
      }
      const normalized = validation.normalizedRelays?.length ? validation.normalizedRelays : validation.validRelays?.length ? validation.validRelays : [...relays, v];
      onChange([...new Set(normalized)]);
      setValue('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid relay URL');
    }
  }
  function remove(url: string) {
    onChange(relays.filter((r) => r !== url));
    setError(null);
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="wss://relay.example" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <IconButton variant="ghost" size="lg" icon={<Plus />} onClick={add} tooltip="Add relay" />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="space-y-2">
        {relays.map((r) => (
          <div key={r} className="flex items-center justify-between rounded-md border border-blue-900/40 bg-black/30 px-3 py-2 text-sm">
            <span className="font-mono text-blue-50">{r}</span>
            <IconButton variant="destructive" size="sm" icon={<X />} onClick={() => remove(r)} tooltip="Remove" />
          </div>
        ))}
      </div>
    </div>
  );
}
