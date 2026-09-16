/**
 * lib-blurhash — public surface.
 *
 * A barrel, deliberately: `xp.ts` consumes the pure layer, so the two cannot both live here
 * without a require cycle.
 *
 */

// XP-facing: read, store, render.
export { encode, process, decode } from './xp';
export { install } from './install';
export type { InstallOpts } from './install';
export { backfill } from './backfill-task';
export type { BackfillOpts } from './backfill-task';
export type { BackfillSummary } from './backfill';
export type { ProcessResult, ProcessStatus, DecodeOpts } from './xp';

// Pure: usable without content, and the part that is unit-tested.
export { encodeRgb, decodeRgb, encodeThumbnail, isValidHash, version } from './codec';
export { DEFAULT_COMPONENTS_X, DEFAULT_COMPONENTS_Y } from './codec';
export { readThumbnail } from './pixels';
export type { Thumbnail } from './pixels';
