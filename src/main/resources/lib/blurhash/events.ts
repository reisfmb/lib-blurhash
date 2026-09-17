/**
 * Keeps hashes current without anyone asking: on upload or re-upload, encode and store.
 *
 * The listener is the only part of the library that runs unprompted, so it is deliberately
 * timid — it filters hard, it never throws, and it leans on the fingerprint guard in
 * `process` rather than trying to be clever about what changed.
 */

import { listener } from '/lib/xp/event';
import { run } from '/lib/xp/context';
import { logSafe } from './backfill';
import { repositoryUsesApp } from './backfill-task';
import { process } from './xp';

/** Content lives in draft until an editor publishes; the library never writes to master. */
const BRANCH = 'draft';

/** Content repositories. Ignores system-repo and anything else an event may come from. */
const CONTENT_REPO = /^com\.enonic\.cms\./;

type EventNode = { id: string; path: string; branch: string; repo: string };
type NodeEvent = { type: string; data: { nodes?: EventNode[] } };

/**
 * Guards repeat calls within one module instance. It is *not* what makes registration
 * once-per-app.
 *
 * XP gives each controller its own module instance, so this flag is per-controller: a
 * library that registered on import would add a listener for every controller that imported
 * it, each one hashing the same upload. Observed during M4, not theorised.
 *
 * What makes it once per app is the call site — `main.js` runs exactly once when the
 * application starts, and that is the only place `init()` belongs.
 */
let registered = false;

/**
 * Start listening for image changes. Called by `init()`, which is the consumer's entry
 * point — registering from a controller would add one listener per controller instance.
 */
export function registerListener(): void {
  if (registered) return;
  registered = true;

  listener<NodeEvent['data']>({
    type: '(node.created|node.updated)',
    localOnly: false,
    callback: (event) => onNodeEvent(event as NodeEvent),
  });

  log.info('[blurhash] listening for image changes');
}

/**
 * Answers for repositories we have already looked at.
 *
 * Safe as module state because the listener is registered exactly once, from `init()`.
 * Without it every upload would re-query for sites; with it the cost is one query per
 * repository per application start.
 */
const relevantRepos: Record<string, boolean> = {};

/**
 * Is this application connected to the repository the event came from?
 *
 * Needed because events arrive from *every* content repository, including projects that
 * never registered our mixin. Writing there is refused by XP ("Not allowed mixinName"), so
 * without this check a second registered app turns every upload into a logged failure.
 */
function isRelevant(repo: string): boolean {
  if (relevantRepos[repo] === undefined) {
    relevantRepos[repo] = repositoryUsesApp(repo);
  }
  return relevantRepos[repo];
}

function onNodeEvent(event: NodeEvent): void {
  const nodes = event?.data?.nodes;
  if (!nodes) return;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.branch !== BRANCH || !CONTENT_REPO.test(node.repo)) continue;
    if (!isRelevant(node.repo)) continue;

    handle(node);
  }
}

/**
 * One node, isolated.
 *
 * Every failure is logged and swallowed. An event callback that throws takes nothing useful
 * with it — the upload has already happened — and a missing placeholder must never be the
 * reason an editor cannot save an image.
 */
function handle(node: EventNode): void {
  try {
    // The event carries no content type, so `process` is what decides: it reads the content
    // and skips anything that is not a media:image. Cheap enough at upload rates, and the
    // alternative is duplicating that read here.
    const result = run({ repository: node.repo, branch: BRANCH }, () => process(node.id));

    if (result.status === 'written') {
      // logSafe, because XP runs String.format over the message and discards extra
      // arguments: a base83 hash contains '%' and would throw on its way to the log.
      log.info(`[blurhash] hashed ${logSafe(node.path)} -> ${logSafe(result.hash)}`);
    }
  } catch (e) {
    const err = e as Error;
    log.warning(`[blurhash] could not hash ${logSafe(node.path)}: ${logSafe(err.message)}`);
  }
}
