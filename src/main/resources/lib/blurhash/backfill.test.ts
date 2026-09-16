import { describe, expect, it } from 'vitest';
import { logSafe, repositoryOf, summarize, usesApp } from './backfill';
import type { ProcessResult } from './xp';

const r = (status: ProcessResult['status']): ProcessResult => ({ status });

describe('summarize', () => {
  it('counts each status and the total', () => {
    expect(summarize([r('written'), r('written'), r('unchanged'), r('skipped')])).toEqual({
      written: 2,
      unchanged: 1,
      skipped: 1,
      total: 4,
    });
  });

  // A project with no images is normal, not an error.
  it('returns zeros for an empty run', () => {
    expect(summarize([])).toEqual({ written: 0, unchanged: 0, skipped: 0, total: 0 });
  });
});

describe('usesApp', () => {
  // XP stores one object for a single app and an array for several; both are real shapes.
  // Same shape on a project and on a site, and XP stores one object for a single app but an
  // array for several — so both callers need both cases.
  it('matches a single config object', () => {
    expect(usesApp({ applicationKey: 'bre.app.blurhash' }, 'bre.app.blurhash')).toBe(true);
  });

  it('matches within an array of configs', () => {
    expect(usesApp(
      [{ applicationKey: 'com.example.x' }, { applicationKey: 'bre.app.blurhash' }],
      'bre.app.blurhash',
    )).toBe(true);
  });

  // The failure that matters: writing our mixin data where it was never registered.
  it('does not match a different app', () => {
    expect(usesApp({ applicationKey: 'com.example.x' }, 'bre.app.blurhash')).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['empty array', []],
    ['an entry without a key', [{}]],
  ])('is false: %s', (_label, config) => {
    expect(usesApp(config as never, 'bre.app.blurhash')).toBe(false);
  });

  it('is false without an app name', () => {
    expect(usesApp({ applicationKey: 'bre.app.blurhash' }, '')).toBe(false);
  });
});

describe('repositoryOf', () => {
  it('prefixes the project id', () => {
    expect(repositoryOf({ id: 'demo' })).toBe('com.enonic.cms.demo');
  });

  it('returns null without an id', () => {
    expect(repositoryOf({} as never)).toBeNull();
  });
});

describe('logSafe', () => {
  // XP applies String.format to the log message and discards extra arguments, so values must
  // be interpolated — and an unescaped '%' from a base83 hash throws on the way to the log.
  it('escapes percent signs', () => {
    expect(logSafe('LdE{LX9%2Bxu')).toBe('LdE{LX9%%2Bxu');
  });

  it('escapes every occurrence', () => {
    expect(logSafe('%a%b%')).toBe('%%a%%b%%');
  });

  it('leaves ordinary text alone', () => {
    expect(logSafe('/content/site/photo.jpg')).toBe('/content/site/photo.jpg');
  });

  it.each([['null', null], ['undefined', undefined], ['a number', 7]])('stringifies %s', (_l, v) => {
    expect(typeof logSafe(v)).toBe('string');
  });
});
