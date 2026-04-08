export function padToByteWidthDots(widthDots: number): number {
  if (widthDots <= 0) return 0;
  return Math.ceil(widthDots / 8) * 8;
}

function hexByte(b: number): string {
  return (b & 0xff).toString(16).padStart(2, "0");
}

/**
 * Convert packed 1bpp bitmap to hex string lines for CPCL EG.
 *
 * - bitmap is row-major, bytes per row = paddedWidthDots/8
 * - widthDots is the actual image width (<= paddedWidthDots)
 */
export function bitmap1bppToHexLines(params: {
  bitmap: Uint8Array;
  widthDots: number;
  heightDots: number;
  paddedWidthDots: number;
  /** How many bytes per line in output hex stream (for readability). */
  bytesPerLine?: number;
}): string[] {
  const rowBytes = params.paddedWidthDots / 8;
  const expected = rowBytes * params.heightDots;
  if (params.bitmap.length !== expected) {
    throw new Error(`bitmap1bpp length mismatch: got ${params.bitmap.length}, expected ${expected}`);
  }

  const bpl = Math.max(1, params.bytesPerLine ?? 64);
  const lines: string[] = [];
  let current = "";
  let count = 0;
  for (let i = 0; i < params.bitmap.length; i++) {
    current += hexByte(params.bitmap[i]!);
    count++;
    if (count >= bpl) {
      lines.push(current);
      current = "";
      count = 0;
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

