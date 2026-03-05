export function normalizeNip44PayloadForJs(value: string): string {
  const trimmed = value.trim();
  const mod = trimmed.length % 4;
  if (mod === 0) return trimmed;
  return `${trimmed}${'='.repeat(4 - mod)}`;
}

export function normalizeNip44PayloadForRust(value: string): string {
  return value.trim().replace(/=+$/g, '');
}
