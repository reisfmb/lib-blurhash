/**
 * The backfill, as a named task.
 *
 * Named rather than a function task because `task.executeFunction` is unsupported on
 * GraalJS — a function cannot leave the script context that created it. That forces a
 * descriptor, and a descriptor lives at an app-level path, so this file is shipped by the
 * library and merged into the consuming app's bundle like the mixin.
 */

import { runBackfill } from '/lib/blurhash/backfill-task';

type Params = {
  /** Comma-separated repository ids. Empty means "discover from the app's projects". */
  repositories?: string;
};

export function run(params: Params): void {
  const listed = (params && params.repositories ? params.repositories : '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  runBackfill(listed);
}
