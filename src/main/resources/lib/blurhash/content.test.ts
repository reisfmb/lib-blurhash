import { describe, expect, it } from 'vitest';
import { dataNamespace, fingerprint, isStale } from './content';

describe('dataNamespace', () => {
  it('replaces dots with dashes, as XP does for the x namespace', () => {
    expect(dataNamespace('bre.app.blurhash')).toBe('bre-app-blurhash');
  });

  it('leaves a key without dots alone', () => {
    expect(dataNamespace('myapp')).toBe('myapp');
  });

  it.each([['empty', ''], ['null', null], ['a number', 7]])('returns null: %s', (_l, v) => {
    expect(dataNamespace(v as string)).toBeNull();
  });
});

describe('fingerprint', () => {
  const sha = 'a'.repeat(128);

  it('keeps the first 16 characters', () => {
    expect(fingerprint(sha)).toBe('a'.repeat(16));
    expect(fingerprint(sha)).toHaveLength(16);
  });

  it.each([
    ['too short to fingerprint', 'abc'],
    ['empty', ''],
    ['missing', undefined],
    ['not a string', 12345],
  ])('returns null: %s', (_label, value) => {
    expect(fingerprint(value)).toBeNull();
  });
});

describe('isStale', () => {
  const sha = 'abcdef0123456789' + '0'.repeat(112);
  const stored = { hash: 'LEHV6nWB', source: 'abcdef0123456789' };

  it('is false when the fingerprint matches — the loop guard', () => {
    expect(isStale(stored, sha)).toBe(false);
  });

  it('is true when the binary changed', () => {
    expect(isStale(stored, 'ffffffffffffffff' + '0'.repeat(112))).toBe(true);
  });

  it.each([
    ['nothing stored', null],
    ['undefined', undefined],
    ['hash without source', { hash: 'LEHV6nWB' }],
    ['source without hash', { source: 'abcdef0123456789' }],
    ['empty object', {}],
  ])('is true when we cannot prove otherwise: %s', (_label, value) => {
    expect(isStale(value as never, sha)).toBe(true);
  });

  // Attachment metadata is XP's to provide; absent, re-encoding is the safe answer.
  it('is true when the current sha512 is missing', () => {
    expect(isStale(stored, undefined)).toBe(true);
  });
});
