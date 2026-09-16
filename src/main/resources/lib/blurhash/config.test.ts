import { describe, expect, it } from 'vitest';
import { DEFAULTS, KEYS, parseConfig } from './config';

describe('parseConfig', () => {
  it('returns every default for an empty or missing map', () => {
    expect(parseConfig({}).config).toEqual(DEFAULTS);
    expect(parseConfig(undefined).config).toEqual(DEFAULTS);
    expect(parseConfig(null).config).toEqual(DEFAULTS);
    expect(parseConfig({}).rejected).toEqual([]);
  });

  it('reads valid values', () => {
    const { config, rejected } = parseConfig({
      [KEYS.componentsX]: '6',
      [KEYS.componentsY]: '2',
      [KEYS.maxEdge]: '64',
      [KEYS.listener]: 'false',
      [KEYS.backfill]: 'false',
    });
    expect(config).toEqual({ componentsX: 6, componentsY: 2, maxEdge: 64, listener: false, backfill: false });
    expect(rejected).toEqual([]);
  });

  it('tolerates surrounding whitespace, as a .cfg line may carry', () => {
    const { config, rejected } = parseConfig({ [KEYS.componentsX]: ' 5 ', [KEYS.listener]: ' true ' });
    expect(config.componentsX).toBe(5);
    expect(config.listener).toBe(true);
    expect(rejected).toEqual([]);
  });

  it.each([['0'], ['10'], ['-1'], ['4.5'], ['abc'], ['']])(
    'falls back on an out-of-range or non-numeric component count: %j',
    (value) => {
      const { config, rejected } = parseConfig({ [KEYS.componentsX]: value });
      expect(config.componentsX).toBe(DEFAULTS.componentsX);
      expect(rejected).toEqual([{ key: KEYS.componentsX, value }]);
    },
  );

  it.each([['7'], ['257'], ['32px']])('falls back on a maxEdge outside 8–256: %j', (value) => {
    const { config, rejected } = parseConfig({ [KEYS.maxEdge]: value });
    expect(config.maxEdge).toBe(DEFAULTS.maxEdge);
    expect(rejected).toEqual([{ key: KEYS.maxEdge, value }]);
  });

  it.each([['8'], ['256']])('accepts the maxEdge bounds: %j', (value) => {
    expect(parseConfig({ [KEYS.maxEdge]: value }).config.maxEdge).toBe(Number(value));
  });

  it.each([['TRUE'], ['False'], ['0'], ['1'], ['yes'], ['no'], ['']])(
    'is strict about booleans: %j gets the default and a warning',
    (value) => {
      const { config, rejected } = parseConfig({ [KEYS.backfill]: value });
      expect(config.backfill).toBe(DEFAULTS.backfill);
      expect(rejected).toEqual([{ key: KEYS.backfill, value }]);
    },
  );

  it('ignores keys that are not ours', () => {
    const { config, rejected } = parseConfig({ 'other.app.key': 'x', 'blurhash.unknown': 'y' });
    expect(config).toEqual(DEFAULTS);
    expect(rejected).toEqual([]);
  });

  it('reports every rejection, not just the first', () => {
    const { rejected } = parseConfig({ [KEYS.componentsX]: 'a', [KEYS.componentsY]: 'b', [KEYS.listener]: 'c' });
    expect(rejected.map((r) => r.key)).toEqual([KEYS.componentsX, KEYS.componentsY, KEYS.listener]);
  });
});
