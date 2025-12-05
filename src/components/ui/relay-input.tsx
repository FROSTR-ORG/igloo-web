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
        <IconButton variant="outline" size="lg" icon={<Plus className="h-4 w-4" />} onClick={add} tooltip="Add relay" />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
