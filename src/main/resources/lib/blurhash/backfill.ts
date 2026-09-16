/**
 * What a backfill covers, and what it did.
 *
 * Pure: no XP, so the two decisions that matter — which repositories to touch, and how to
 * count the outcome — are testable without a running application. The task itself lives in
 * `backfill-task.ts`.
 */

import type { ProcessResult, ProcessStatus } from './xp';

/**
 * Images per query. At ~40 ms an image this is well under a second per batch: often enough
 * to report progress, large enough that query overhead does not dominate.
 */
export const BATCH = 20;

export const CONTENT_REPO_PREFIX = 'com.enonic.cms.';

export type BackfillSummary = {
  written: number;
  unchanged: number;
  skipped: number;
  total: number;
};

export type Project = { id: string; siteConfig?: SiteConfig | SiteConfig[] };

/** A site's app config. XP stores one object when there is a single app, an array when more. */
export type SiteConfig = { applicationKey?: string };
export type SiteData = { siteConfig?: SiteConfig | SiteConfig[] };

export function emptySummary(): BackfillSummary {
  return { written: 0, unchanged: 0, skipped: 0, total: 0 };
}

/** Tally of what a run did. Progress reports this, so a wrong count makes progress lie. */
export function summarize(results: ProcessResult[]): BackfillSummary {
  const summary = emptySummary();

  for (let i = 0; i < results.length; i++) {
    const status: ProcessStatus = results[i].status;
    summary[status] = summary[status] + 1;
    summary.total = summary.total + 1;
  }
  return summary;
}

export function addSummary(into: BackfillSummary, batch: BackfillSummary): void {
  into.written += batch.written;
  into.unchanged += batch.unchanged;
  into.skipped += batch.skipped;
  into.total += batch.total;
}

/** Repository id for a project. */
export function repositoryOf(project: Project): string | null {
  return project && project.id ? CONTENT_REPO_PREFIX + project.id : null;
}

/**
 * Is this application among a set of app configs?
 *
 * The same shape appears on a project and on a site, and XP stores one object for a single
 * app and an array for several — so both callers need the same two-case unwrapping.
 */
export function usesApp(config: SiteConfig | SiteConfig[] | undefined, appName: string): boolean {
  if (!config || !appName) return false;

  const configs: SiteConfig[] = Array.isArray(config) ? config : [config];
  return configs.some((c) => c && c.applicationKey === appName);
}

/**
 * XP's log applies String.format to the message and **discards any extra arguments**, so a
 * value has to be interpolated — and a bare '%' then blows up the whole call.
 *
 * Base83 hashes contain '%', so this is not hypothetical: an unescaped hash threw
 * UnknownFormatConversionException and cost an image its placeholder.
 */
export function logSafe(value: unknown): string {
  return String(value).replace(/%/g, '%%');
}
