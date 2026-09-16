/**
 * Pixel-buffer plumbing between the Java bridge and the vendored codec.
 *
 * The bridge returns a Java `int[]`, which GraalJS presents as an ordinary JS array — real
 * indexing, real `.length`, but not a typed array. The codec is typed for
 * `Uint8ClampedArray`. This is the one place that difference is handled.
 */

/** RGBA. The vendored encoder reads a stride of 4 and ignores the alpha byte. */
export const BYTES_PER_PIXEL = 4;

/**
 * Accept whatever the caller has; hand back what the codec wants.
 *
 * `Uint8ClampedArray.from` copies, so the common path — already clamped — skips it.
 */
export function toClamped(pixels: Uint8ClampedArray | number[]): Uint8ClampedArray {
  return pixels instanceof Uint8ClampedArray ? pixels : Uint8ClampedArray.from(pixels);
}

/** Does this buffer hold exactly width × height RGBA pixels? */
export function hasExpectedLength(
  pixels: Uint8ClampedArray | number[],
  width: number,
  height: number,
): boolean {
  return pixels.length === width * height * BYTES_PER_PIXEL;
}

/** What `ImageBean.rgbaThumbnail` returns, once the header is off. */
export type Thumbnail = { width: number; height: number; pixels: number[] };

/** Header length of the bridge's thumbnail array: width, height. */
const HEADER = 2;

/**
 * Split `[width, height, ...rgba]` into its parts.
 *
 * The bean prefixes the dimensions because only it knows them — they come out of the
 * subsampling factor, and recomputing them from the aspect ratio is off by a rounding step.
 *
 * Null when the array is missing, too short, or its length disagrees with its own header.
 */
export function readThumbnail(raw: number[] | null | undefined): Thumbnail | null {
  if (!raw || raw.length < HEADER) return null;

  const width = raw[0];
  const height = raw[1];
  if (!isValidDimension(width) || !isValidDimension(height)) return null;
  if (raw.length !== HEADER + width * height * BYTES_PER_PIXEL) return null;

  return { width, height, pixels: raw.slice(HEADER) };
}

/** Positive, whole, and small enough that width × height cannot overflow anything. */
export function isValidDimension(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 4096;
}

/** BlurHash packs each axis into one base83 digit, so 1–9 is the whole range. */
export function isValidComponentCount(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 9;
}
