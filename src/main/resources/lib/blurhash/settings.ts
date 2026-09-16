/**
 * The effective config: the consuming app's `.cfg`, parsed once.
 *
 * The library has no bundle of its own — it is merged into the consumer's — so `app.config`
 * here *is* the consumer's `<app.key>.cfg`, the same way `app.name` is the consumer's key.
 *
 * Cached per module instance — so the rejection warnings appear once per instance (main.js,
 * each controller), not once per app. XP restarts an application when its `.cfg` changes,
 * which discards every module instance, so there is no staleness to manage.
 *
 * `app.config` is a Java map presented as a host object: index access works, `Object.keys`
 * returns nothing. Read it by key, never enumerate it.
 */

import { Config, parseConfig } from './config';
import { logSafe } from './backfill';

let cached: Config | null = null;

/** The parsed config. Rejected values are logged the first time this instance is asked. */
export function config(): Config {
  if (cached) return cached;

  const parsed = parseConfig(app.config);
  for (let i = 0; i < parsed.rejected.length; i++) {
    const r = parsed.rejected[i];
    log.warning(`[blurhash] ignoring ${logSafe(r.key)}=${logSafe(JSON.stringify(r.value))} in app config: using the default`);
  }

  cached = parsed.config;
  return cached;
}
