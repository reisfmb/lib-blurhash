import { describe, expect, it } from 'vitest';
import {
  hasExpectedLength,
  isValidComponentCount,
  isValidDimension,
  readThumbnail,
  toClamped,
} from './pixels';

describe('toClamped', () => {
  it('passes a Uint8ClampedArray through without copying', () => {
    const input = new Uint8ClampedArray([1, 2, 3, 255]);
    expect(toClamped(input)).toBe(input);
  });

  // The Java bridge returns an int[], which GraalJS presents as a plain array.
  it('converts a plain array, as the Java bridge produces', () => {
    const converted = toClamped([1, 2, 3, 255]);
    expect(converted).toBeInstanceOf(Uint8ClampedArray);
    expect(Array.from(converted)).toEqual([1, 2, 3, 255]);
  });

  it('clamps out-of-range values rather than wrapping them', () => {
    expect(Array.from(toClamped([-5, 300, 128, 255]))).toEqual([0, 255, 128, 255]);
  });
});

describe('hasExpectedLength', () => {
  it('accepts width × height × 4', () => {
    expect(hasExpectedLength(new Uint8ClampedArray(2 * 3 * 4), 2, 3)).toBe(true);
  });

  // A stride-3 buffer is the regression this guards: it would encode, and be wrong.
  it('rejects a stride-3 buffer of the same dimensions', () => {
    expect(hasExpectedLength(new Uint8ClampedArray(2 * 3 * 3), 2, 3)).toBe(false);
  });
});

describe('isValidDimension', () => {
  it.each([1, 32, 4096])('accepts %i', (v) => expect(isValidDimension(v)).toBe(true));
  it.each([0, -1, 1.5, 4097, NaN, Infinity])('rejects %p', (v) =>
    expect(isValidDimension(v)).toBe(false));
});

describe('isValidComponentCount', () => {
  // BlurHash packs each axis into one base83 digit: 1-9 is the entire range.
  it.each([1, 4, 9])('accepts %i', (v) => expect(isValidComponentCount(v)).toBe(true));
  it.each([0, 10, 2.5, NaN])('rejects %p', (v) => expect(isValidComponentCount(v)).toBe(false));
});

describe('readThumbnail', () => {
  const rgba = (count: number) => Array.from({ length: count * 4 }, (_, i) => i % 256);

  it('splits the width/height header from the pixels', () => {
    const thumb = readThumbnail([2, 3, ...rgba(6)]);
    expect(thumb).not.toBeNull();
    expect(thumb!.width).toBe(2);
    expect(thumb!.height).toBe(3);
    expect(thumb!.pixels).toHaveLength(2 * 3 * 4);
  });

  // The failure this type exists to prevent: dimensions guessed from the aspect ratio
  // disagreed with the bean's by one rounding step, and encode silently returned null.
  it('rejects a length that disagrees with its own header', () => {
    expect(readThumbnail([14, 32, ...rgba(13 * 32)])).toBeNull();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', []],
    ['header only', [4, 4]],
    ['zero dimension', [0, 4]],
  ])('returns null: %s', (_label, raw) => {
    expect(readThumbnail(raw as number[] | null | undefined)).toBeNull();
  });
});
