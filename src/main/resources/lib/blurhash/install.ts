/**
 * What a consumer calls once, from `main.ts`.
 *
 * Both halves of "keep hashes current" start here: the listener for images uploaded from now
 * on, the backfill for those already present.
 */

import { backfill } from './backfill-task';
import { registerListener } from './events';
import { config } from './settings';

export type InstallOpts = {
  /** Hash images as they are uploaded or replaced. Default: `blurhash.listener` in the app's .cfg, else true. */
  listener?: boolean;

  /** Hash images that already exist, on application start. Default: `blurhash.backfill` in the app's .cfg, else true. */
  backfill?: boolean;
};

/**
 * Register the listener and start a backfill. Both are on unless switched off — either half
 * is useful alone, and the two together are what "hashes stay current" means.
 *
 * Precedence: an explicit `opts` value, then the app's `.cfg`, then the default. Code wins
 * over config because the argument is the consumer saying so at the call site; config is for
 * operators who cannot redeploy.
 *
 * Call this from the consuming app's `main.ts`. The library has no import side effects,
 * because XP gives each controller its own module instance — registering on import would
 * add a listener per controller (see `.claude/docs/findings/module-scope.md`).
 */
export function install(opts?: InstallOpts): void {
  const settings = config();
  const listener = opts && opts.listener !== undefined ? opts.listener : settings.listener;
  const runBackfill = opts && opts.backfill !== undefined ? opts.backfill : settings.backfill;

  if (listener) {
    attempt('register the event listener', () => {
      registerListener();
    });
  }

  // On by default: a library that quietly leaves existing images unhashed is the more
  // surprising behaviour, and a repeat run is nearly free.
  if (runBackfill) {
    attempt('start the backfill', () => {
      const taskId = backfill();
      log.info(`[blurhash] backfill started (task ${taskId})`);
    });
  }
}

/**
 * Neither half of install() may take down the caller.
 *
 * `main.js` is also what XP's script test harness executes, and that harness provides no
 * event or task service — so an unguarded `install()` fails a consumer's test suite for
 * reasons that have nothing to do with the consumer. The same applies to any environment
 * where a service is missing: the library should degrade to "no hashes", not to "no app".
 *
 * Failures are logged as warnings rather than swallowed, so a listener that genuinely fails
 * to register is still visible.
 */
function attempt(what: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    log.warning(`[blurhash] could not ${what}: ${(e as Error).message}`);
  }
}
