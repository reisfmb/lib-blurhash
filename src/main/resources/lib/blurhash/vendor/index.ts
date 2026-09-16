/**
 * Re-export of the vendored implementation, so the wrapper has one import path.
 *
 * `encode` and `decode` are default exports upstream; they are named here because a default
 * export tells a reader nothing at the call site.
 */
export { default as encode } from './encode';
export { default as decode, isBlurhashValid } from './decode';
export { ValidationError } from './error';
