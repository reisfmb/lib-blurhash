/**
 * The decisions `process` makes, separated from the XP calls that carry them out.
 *
 * Everything here is a pure function of values read from content, so it is testable without
 * a running XP — which matters, because the staleness comparison is the loop guard and a
 * wrong answer there means either an infinite re-encode or a hash that never updates.
 */

/** What the library stores in the mixin. */
export type BlurhashData = { hash?: string; source?: string };

/** Characters of the attachment's sha512 kept as a fingerprint. */
const FINGERPRINT_LENGTH = 16;

/**
 * The `x` key for an app: its key with dots replaced by dashes.
 *
 * Derived from `app.name` at runtime rather than hardcoded, because the mixin belongs to the
 * app that registered it in `cms.yaml`, not to this library. Hardcoding would work for our
 * demo app and break every other consumer.
 */
export function dataNamespace(appName: string): string | null {
  if (typeof appName !== 'string' || appName.length === 0) return null;
  return appName.replace(/\./g, '-');
}

/**
 * The stored fingerprint for an attachment's sha512.
 *
 * Null when there is nothing to fingerprint — a caller must treat that as "cannot compare",
 * not as "unchanged".
 */
export function fingerprint(sha512: unknown): string | null {
  if (typeof sha512 !== 'string' || sha512.length < FINGERPRINT_LENGTH) return null;
  return sha512.substring(0, FINGERPRINT_LENGTH);
}

/**
 * Does this content need re-encoding?
 *
 * True whenever we cannot prove otherwise: no stored hash, no stored fingerprint, or a
 * fingerprint that differs. Re-encoding needlessly costs ~40 ms; skipping wrongly leaves a
 * placeholder that shows the previous image, which is worse.
 */
export function isStale(stored: BlurhashData | null | undefined, currentSha512: unknown): boolean {
  if (!stored || !stored.hash || !stored.source) return true;

  const current = fingerprint(currentSha512);
  if (!current) return true;

  return stored.source !== current;
}
