/**
 * lib-blurhash — public surface.
 *
 * A barrel, deliberately: `xp.ts` consumes the pure layer, so the two cannot both live here
 * without a require cycle.
 *
 * Importing this module has no side effects: the event listener is registered by calling
 * `install()` from the consuming app's `main.ts`, so that the registration has one visible
 * call site rather than happening once per controller that imports the library.
 */

// XP-facing: read, store, render.
export { encode, process, decode } from './xp';
export { install } from './events';
export type { ProcessResult, ProcessStatus, DecodeOpts } from './xp';

// Pure: usable without content, and the part that is unit-tested.
export { encodeRgb, decodeRgb, encodeThumbnail, isValidHash, version } from './codec';
export { DEFAULT_COMPONENTS_X, DEFAULT_COMPONENTS_Y } from './codec';
export { readThumbnail } from './pixels';
export type { Thumbnail } from './pixels';
