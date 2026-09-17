/**
 * Runs the backfill: the XP half. The decisions it makes are in `backfill.ts`.
 *
 * Hashes images that already exist.
 *
 * The listener keeps new uploads current; this is for everything that was there before the
 * library was installed — which, on a real installation, is all of it.
 *
 * Runs as a task from `init()`. There is no endpoint, so there is no caller to
 * authenticate: the work starts at application startup in a system context.
 */

import { query } from '/lib/xp/content';
import { run } from '/lib/xp/context';
import { list as listProjects } from '/lib/xp/project';
import { progress, submitTask } from '/lib/xp/task';
import { process } from './xp';
import type { ProcessResult } from './xp';
import {
  BATCH,
  Project,
  SiteData,
  addSummary,
  emptySummary,
  logSafe,
  repositoryOf,
  summarize,
  usesApp,
} from './backfill';

export type BackfillOpts = { repositories?: string[] };

/**
 * Start a backfill. Returns a task id immediately — nothing waits for a media library, least
 * of all application startup.
 *
 * Submits a *named* task: `task.executeFunction` is unsupported on GraalJS, because the
 * function cannot leave the script context that created it. The descriptor is derived from
 * `app.name`, since the library's task resource is merged into the consuming app's bundle
 * and therefore carries that app's key.
 */
export function backfill(opts?: BackfillOpts): string {
  const repositories = opts && opts.repositories ? opts.repositories : [];

  return submitTask({
    descriptor: `${app.name}:blurhash-backfill`,
    config: { repositories: repositories.join(',') },
  });
}

/** The task body. Exported for the task descriptor, not for consumers. */
export function runBackfill(repositories: string[]): void {
  const targets = repositories && repositories.length > 0 ? repositories : discoverRepositories();

  if (targets.length === 0) {
    log.info('[blurhash] backfill: no project uses this app — nothing to do');
    return;
  }

  for (let i = 0; i < targets.length; i++) {
    backfillRepository(targets[i]);
  }
}

/**
 * Every repository holding a site that uses this application.
 *
 * An app is connected either to the project or to a site inside it, and the two live in
 * different places: the project carries `siteConfig` when connected there, otherwise the site
 * content does. Checking only projects silently matches nothing, which is how this first
 * failed.
 *
 * Elevated: both calls are admin APIs and startup has no user. A failure here is a log line,
 * not an error — without a repository list there is simply nothing to do.
 */
function discoverRepositories(): string[] {
  try {
    const projects = run(
      { repository: 'system-repo', branch: 'master', principals: ['role:system.admin'] },
      () => listProjects() as unknown as Project[],
    );

    const selected: string[] = [];
    for (let i = 0; i < projects.length; i++) {
      const repository = repositoryOf(projects[i]);
      if (repository && repositoryUsesApp(repository, projects[i])) selected.push(repository);
    }
    return selected;
  } catch (e) {
    log.warning('[blurhash] backfill: could not list projects: ' + logSafe((e as Error).message));
    return [];
  }
}

/**
 * Is this application connected to the project, or to a site inside it?
 *
 * Either way the whole repository is backfilled. Restricting a site-level connection to that
 * site's subtree would be more precise and not more correct: images live in shared folders
 * as often as under a site, and a hash on an image nobody renders costs one field.
 */
export function repositoryUsesApp(repository: string, project?: Project): boolean {
  if (project && usesApp(project.siteConfig, app.name)) return true;

  try {
    return run(
      { repository, branch: 'draft', principals: ['role:system.admin'] },
      () =>
        query({ count: 50, contentTypes: ['portal:site'], query: '' }).hits.some((hit) =>
          usesApp((hit as unknown as { data: SiteData }).data.siteConfig, app.name),
        ),
    );
  } catch (e) {
    log.warning(`[blurhash] backfill: cannot read ${logSafe(repository)}: ${logSafe((e as Error).message)}`);
    return false;
  }
}

function backfillRepository(repository: string): void {
  const context = { repository, branch: 'draft', principals: ['role:system.admin' as const] };

  const total = run(context, () => countImages());
  if (total === 0) return;

  const summary = emptySummary();
  let start = 0;

  while (start < total) {
    // Re-queried each batch rather than collected up front: process writes to these same
    // nodes, and _path ASC keeps the window stable while that happens.
    const ids = run(context, () => page(start));
    if (ids.length === 0) break;

    const results: ProcessResult[] = [];
    for (let i = 0; i < ids.length; i++) {
      results.push(safeProcess(context, ids[i]));
    }

    addSummary(summary, summarize(results));
    start += ids.length;

    // Per batch, not per image: progress is persisted, and one update per image on a large
    // library costs more than the hashing does.
    progress({ current: start, total, info: `${repository}: ${summary.written} hashed` });
  }

  log.info(
    `[blurhash] backfill ${logSafe(repository)}: ${summary.written} hashed, ` +
      `${summary.unchanged} already current, ${summary.skipped} skipped`,
  );
}

function countImages(): number {
  return query({ count: 0, contentTypes: ['media:image'], query: '' }).total;
}

function page(start: number): string[] {
  const hits = query({
    start,
    count: BATCH,
    contentTypes: ['media:image'],
    sort: '_path ASC',
    query: '',
  }).hits;

  return hits.map((hit) => hit._id);
}

/** One image cannot fail the run: a backfill that stops at the first bad file is useless. */
function safeProcess(context: Parameters<typeof run>[0], id: string): ProcessResult {
  try {
    return run(context, () => process(id));
  } catch (e) {
    log.warning(`[blurhash] backfill: ${logSafe(id)} failed: ${logSafe((e as Error).message)}`);
    return { status: 'skipped', reason: 'error' };
  }
}
