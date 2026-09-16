import { describe, expect, it } from 'vitest';
import { decodeRgb, encodeRgb, isValidHash } from './index';

/** A solid block of one colour, RGBA, alpha opaque — what the bean hands us. */
function solid(width: number, height: number, r: number, g: number, b: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < width * height; i++) out.push(r, g, b, 255);
  return out;
}

describe('encodeRgb', () => {
  it('encodes a plain array, as the Java bridge produces', () => {
    const hash = encodeRgb(solid(4, 4, 120, 80, 200), 4, 4);
    expect(typeof hash).toBe('string');
    expect(isValidHash(hash)).toBe(true);
  });

  it('agrees with the typed-array form', () => {
    const plain = solid(4, 4, 10, 200, 30);
    expect(encodeRgb(plain, 4, 4)).toBe(encodeRgb(Uint8ClampedArray.from(plain), 4, 4));
  });

  // 4x3 components: 1 size + 1 maxAC + 4 DC + 2 per remaining AC = 4 + 2*12.
  it('defaults to 4×3 components, giving a 28-character hash', () => {
    expect(encodeRgb(solid(8, 8, 50, 50, 50), 8, 8)).toHaveLength(28);
  });

  it('honours explicit component counts', () => {
    expect(encodeRgb(solid(8, 8, 50, 50, 50), 8, 8, 1, 1)).toHaveLength(6);
    expect(encodeRgb(solid(8, 8, 50, 50, 50), 8, 8, 9, 9)).toHaveLength(4 + 2 * 81);
  });

  it('returns null for a stride-3 buffer', () => {
    const rgbOnly = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(encodeRgb(rgbOnly, 2, 2)).toBeNull();
  });

  it.each([
    ['zero width', 0, 4, 4, 3],
    ['fractional height', 4, 2.5, 4, 3],
    ['components below range', 4, 4, 0, 3],
    ['components above range', 4, 4, 4, 10],
  ])('returns null: %s', (_label, w, h, cx, cy) => {
    expect(encodeRgb(solid(4, 4, 1, 2, 3), w as number, h as number, cx as number, cy as number))
      .toBeNull();
  });
});

describe('decodeRgb', () => {
  it('returns width × height × 4 bytes', () => {
    const hash = encodeRgb(solid(4, 4, 120, 80, 200), 4, 4) as string;
    expect(decodeRgb(hash, 8, 6)).toHaveLength(8 * 6 * 4);
  });

  it('round-trips a flat colour: the mean is preserved, not each pixel', () => {
    const hash = encodeRgb(solid(8, 8, 120, 80, 200), 8, 8) as string;
    const out = decodeRgb(hash, 16, 16) as Uint8ClampedArray;

    // BlurHash's basis is not orthonormal on the sample grid, so even a uniform image gets
    // non-zero AC terms and individual pixels drift by tens of levels. The average is what
    // survives, which is all a placeholder needs.
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < out.length; i += 4) { r += out[i]; g += out[i + 1]; b += out[i + 2]; n++; }

    expect(Math.abs(r / n - 120)).toBeLessThan(8);
    expect(Math.abs(g / n - 80)).toBeLessThan(8);
    expect(Math.abs(b / n - 200)).toBeLessThan(8);
    expect(out[3]).toBe(255);
  });

  it('preserves structure: a light half stays lighter than a dark half', () => {
    const pixels: number[] = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const v = y < 4 ? 230 : 20;
        pixels.push(v, v, v, 255);
      }
    }
    const out = decodeRgb(encodeRgb(pixels, 8, 8) as string, 8, 8) as Uint8ClampedArray;

    // Compare means rather than pixels: the transform is lossy, the ordering is not.
    const mean = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i += 4) sum += out[i];
      return sum / ((to - from) / 4);
    };
    expect(mean(0, 8 * 4 * 4)).toBeGreaterThan(mean(8 * 4 * 4, out.length));
  });

  // The PRD contract: upstream throws ValidationError, we render no placeholder instead.
  it.each([
    ['empty', ''],
    ['too short', 'abc'],
    ['illegal character', 'L' + '/'.repeat(27)],
    ['length disagreeing with its own size flag', 'LBGsX$2|]9tD-HJ-o1j]fQfQfQfQXX'],
  ])('returns null instead of throwing: %s', (_label, hash) => {
    expect(decodeRgb(hash as string, 8, 8)).toBeNull();
  });

  it('returns null for an invalid size', () => {
    const hash = encodeRgb(solid(4, 4, 1, 2, 3), 4, 4) as string;
    expect(decodeRgb(hash, 0, 8)).toBeNull();
  });
});

describe('isValidHash', () => {
  it('accepts a hash we produced', () => {
    expect(isValidHash(encodeRgb(solid(4, 4, 9, 9, 9), 4, 4))).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['illegal character', 'L' + '/'.repeat(27)],
    ['wrong length for its size flag', 'LBGsX$2|]9tD-HJ-o1j]fQfQ'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an object', {}],
  ])('rejects %s', (_label, value) => {
    expect(isValidHash(value)).toBe(false);
  });
});
