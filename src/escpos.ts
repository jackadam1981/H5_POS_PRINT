const enc = new TextEncoder();

export type EscPosCompileOptions = {
  /**
   * If true, append LF at end.
   * Many printers accept either, but LF is the common "print line" trigger.
   */
  finalLf?: boolean;
  /** Add a small feed at end (lines). */
  feedLines?: number;
};

function bytes(...parts: (Uint8Array | number[])[]): Uint8Array {
  const chunks = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function text(s: string): Uint8Array {
  return enc.encode(s);
}

// ESC/POS basics
const ESC = 0x1b;
const GS = 0x1d;

function init(): Uint8Array {
  // ESC @
  return new Uint8Array([ESC, 0x40]);
}

function lf(): Uint8Array {
  return new Uint8Array([0x0a]);
}

function feed(n: number): Uint8Array {
  // ESC d n
  const nn = Math.max(0, Math.min(255, n | 0));
  return new Uint8Array([ESC, 0x64, nn]);
}

function align(mode: "left" | "center" | "right"): Uint8Array {
  // ESC a n  (0 left, 1 center, 2 right)
  const n = mode === "left" ? 0 : mode === "center" ? 1 : 2;
  return new Uint8Array([ESC, 0x61, n]);
}

function bold(on: boolean): Uint8Array {
  // ESC E n
  return new Uint8Array([ESC, 0x45, on ? 1 : 0]);
}

function size(params: { w: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; h: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }): Uint8Array {
  // GS ! n  where low nibble = width-1, high nibble = height-1
  const n = ((params.h - 1) << 4) | (params.w - 1);
  return new Uint8Array([GS, 0x21, n]);
}

export type EscPosLine = {
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  /** 1..8 */
  sizeW?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** 1..8 */
  sizeH?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
};

/**
 * ESC/POS compilation (minimal receipt subset):
 * - init
 * - per-line: align/bold/size + text + LF
 * - final feed
 *
 * QR/Barcode/image are intentionally not implemented here yet.
 * We will add them after verifying target printers' ESC/POS dialects.
 */
export function compileEscPosReceipt(lines: EscPosLine[], opt?: EscPosCompileOptions): Uint8Array {
  const parts: (Uint8Array | number[])[] = [];
  parts.push(init());
  // default formatting
  parts.push(align("left"));
  parts.push(bold(false));
  parts.push(size({ w: 1, h: 1 }));

  for (const line of lines) {
    parts.push(align(line.align ?? "left"));
    parts.push(bold(Boolean(line.bold)));
    parts.push(size({ w: line.sizeW ?? 1, h: line.sizeH ?? 1 }));
    parts.push(text(line.text));
    parts.push(lf());
  }

  const feedLines = opt?.feedLines ?? 3;
  if (feedLines > 0) parts.push(feed(feedLines));
  if (opt?.finalLf ?? true) parts.push(lf());

  // reset
  parts.push(align("left"));
  parts.push(bold(false));
  parts.push(size({ w: 1, h: 1 }));
  return bytes(...parts);
}

