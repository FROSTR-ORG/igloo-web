import { describe, expect, it } from 'vitest';

import {
  normalizeNip44PayloadForJs,
  normalizeNip44PayloadForRust
} from '../../src/lib/nip44-normalize';

describe('nip44 payload normalization', () => {
  it('pads to base64 length multiple of 4 for JS decrypt path', () => {
    expect(normalizeNip44PayloadForJs('abcd')).toBe('abcd');
    expect(normalizeNip44PayloadForJs('abc')).toBe('abc=');
    expect(normalizeNip44PayloadForJs('ab')).toBe('ab==');
    expect(normalizeNip44PayloadForJs('a')).toBe('a===');
  });

  it('strips trailing base64 padding for Rust decrypt path', () => {
    expect(normalizeNip44PayloadForRust('abcd==')).toBe('abcd');
    expect(normalizeNip44PayloadForRust('abc=')).toBe('abc');
    expect(normalizeNip44PayloadForRust('abc')).toBe('abc');
  });
});
