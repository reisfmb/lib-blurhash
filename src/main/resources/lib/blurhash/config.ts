/**
 * What the consuming app's `.cfg` may say, and what we do when it says it badly.
 *
 * Pure: takes the raw string map and returns a fully-populated config plus the list of values
 * it refused. The caller (`settings.ts`) reads `app.config` and logs the refusals; this file
 * only decides, so the fallback rules are testable without XP — which is where the value is,
 * because the failure mode is silent.
 */

import { isValidComponentCount } from './pixels';

export type Config = {
  /** Horizontal components, 1–9. */
  componentsX: number;
  /** Vertical components, 1–9. */
  componentsY: number;
  /** Sampling size: the thumbnail's long edge, 8–256. */
  maxEdge: number;
  /** Register the upload listener from `init()`. */
  listener: boolean;
  /** Run a backfill from `init()`. */
  backfill: boolean;
};

export const DEFAULTS: Readonly<Config> = {
  componentsX: 4,
  componentsY: 3,
  maxEdge: 32,
  listener: true,
  backfill: true,
};

/** `.cfg` keys, all under one prefix so they sit apart from the app's own. */
export const KEYS: Readonly<Record<keyof Config, string>> = {
  componentsX: 'blurhash.componentsX',
  componentsY: 'blurhash.componentsY',
  maxEdge: 'blurhash.maxEdge',
  listener: 'blurhash.listener',
  backfill: 'blurhash.backfill',
};

/** Below 8 the hash is noise; above 256 is work that ≤9 components cannot use. */
const MIN_EDGE = 8;
const MAX_EDGE = 256;

/** A value the parser refused and replaced with its default. */
export type Rejected = { key: string; value: string };

export type ParsedConfig = { config: Config; rejected: Rejected[] };

/**
 * Raw `.cfg` values -> config. Every value in a `.cfg` is a string; missing is the default.
 *
 * A bad value is replaced, never thrown on: a typo in an operator's `.cfg` must not stop
 * editors saving images.
 */
export function parseConfig(raw: Record<string, string | undefined> | null | undefined): ParsedConfig {
  const source = raw || {};
  const rejected: Rejected[] = [];

  const config: Config = {
    componentsX: integer(source, KEYS.componentsX, DEFAULTS.componentsX, isValidComponentCount, rejected),
    componentsY: integer(source, KEYS.componentsY, DEFAULTS.componentsY, isValidComponentCount, rejected),
    maxEdge: integer(source, KEYS.maxEdge, DEFAULTS.maxEdge, isValidEdge, rejected),
    listener: boolean(source, KEYS.listener, DEFAULTS.listener, rejected),
    backfill: boolean(source, KEYS.backfill, DEFAULTS.backfill, rejected),
  };

  return { config, rejected };
}

function isValidEdge(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_EDGE && value <= MAX_EDGE;
}

/** Whole number in range, or the default. `'4.5'`, `'abc'` and `''` are all rejected. */
function integer(
  source: Record<string, string | undefined>,
  key: string,
  fallback: number,
  accept: (value: number) => boolean,
  rejected: Rejected[],
): number {
  const raw = source[key];
  if (raw === undefined) return fallback;

  const trimmed = raw.trim();
  const value = /^-?\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  if (accept(value)) return value;

  rejected.push({ key, value: raw });
  return fallback;
}

/**
 * Exactly `true` or `false`, or the default. Strict on purpose: a `yes`, a `0` or a `TRUE`
 * gets the default and a warning, not a silent flip either way.
 */
function boolean(
  source: Record<string, string | undefined>,
  key: string,
  fallback: boolean,
  rejected: Rejected[],
): boolean {
  const raw = source[key];
  if (raw === undefined) return fallback;

  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  rejected.push({ key, value: raw });
  return fallback;
}
