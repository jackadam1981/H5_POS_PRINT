import type {
  PrinterProfile,
  TemplateBarcodeElement,
  TemplateImageElement,
  TemplateQRCodeElement,
  TemplateResolved,
  TemplateTextElement,
} from "./types";
import { mmToDots, roundDots } from "./mm.js";
import { bitmap1bppToHexLines, padToByteWidthDots } from "./bitmap.js";

export type CpclCompileResult = {
  bytes: Uint8Array;
  debug: {
    pageWidthDots: number;
    pageHeightDots: number;
    usedNative: {
      text: number;
      qrcode: number;
      barcode: number;
    };
    rasterRequired: {
      text: number;
      image: number;
    };
  };
};

export type RasterImageSlice = {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  /** 1bpp bitmap, row-major, left-to-right, top-to-bottom. */
  bitmap: Uint8Array;
  /** Width in dots. */
  widthDots: number;
  /** Height in dots. */
  heightDots: number;
};

export type RasterPlan = {
  /** Images that must be printed as raster slices (images + non-native text fallback). */
  slices: RasterImageSlice[];
  rasterRequiredCount: {
    image: number;
    text: number;
  };
};

function normalizeRotation(rotationDeg: number): number {
  // Normalize to [0,360)
  const r = rotationDeg % 360;
  return r < 0 ? r + 360 : r;
}

function isNativeRotation(rotationDeg: number, dialect: CpclDialect): boolean {
  const r = normalizeRotation(rotationDeg);
  return dialect.textRotationNative.includes(r as any);
}

type CpclDialect = Required<NonNullable<PrinterProfile["cpclDialect"]>>;

function estimateTemplateHeightMm(tpl: TemplateResolved): number {
  // Prefer explicit canvas height; still ensure it covers elements
  let maxY = tpl.canvas.heightMm;
  for (const el of tpl.elements) {
    const bottom = el.yMm + ("heightMm" in el ? (el as any).heightMm : 0);
    if (bottom > maxY) maxY = bottom;
    if (el.type === "qrcode") {
      const q = el as TemplateQRCodeElement;
      const qb = q.yMm + q.sizeMm;
      if (qb > maxY) maxY = qb;
    }
    if (el.type === "barcode") {
      const b = el as TemplateBarcodeElement;
      const bb = b.yMm + b.heightMm;
      if (bb > maxY) maxY = bb;
    }
  }
  return maxY;
}

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function joinBytes(parts: (Uint8Array | string)[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks = parts.map((p) => (typeof p === "string" ? enc.encode(p) : p));
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// (padToByteWidthDots imported from ./bitmap.js)

/**
 * CPCL compilation (concept-level): builds a CPCL job containing:
 * - raster slices (if provided)
 * - native qrcode/barcode/text where possible
 *
 * NOTE: Rasterization itself is out of scope here; provide RasterPlan.slices from your Rasterizer.
 */
export function compileCpclJob(params: {
  template: TemplateResolved;
  profile: PrinterProfile;
  copies?: number;
  rasterPlan?: RasterPlan;
}): CpclCompileResult {
  const { template, profile } = params;
  const copies = params.copies ?? 1;
  const dialect: CpclDialect = (profile.cpclDialect ?? {
    textRotationNative: [0, 90, 180, 270],
    qrNative: true,
  }) as CpclDialect;

  const pageWidthDots = roundDots(mmToDots(profile, template.canvas.widthMm));
  const pageHeightMm = estimateTemplateHeightMm(template);
  const pageHeightDots = roundDots(mmToDots(profile, pageHeightMm));

  const usedNative = { text: 0, qrcode: 0, barcode: 0 };
  const rasterRequired = {
    text: params.rasterPlan?.rasterRequiredCount.text ?? 0,
    image: params.rasterPlan?.rasterRequiredCount.image ?? 0,
  };

  const lines: (Uint8Array | string)[] = [];

  // Header: use a conservative, widely used CPCL header format. Dialects may override later.
  // ! 0 200 200 <height> <qty>
  // NOTE: 200 here is placeholder density; actual printers may ignore.
  lines.push(`! 0 200 200 ${pageHeightDots} ${copies}\r\n`);
  // Page width. Some CPCL dialects accept PAGE-WIDTH.
  lines.push(`PAGE-WIDTH ${pageWidthDots}\r\n`);

  // Body: raster slices first (background), then native primitives.
  const slices = params.rasterPlan?.slices ?? [];
  for (const s of slices) {
    const x = roundDots(mmToDots(profile, s.xMm));
    const y = roundDots(mmToDots(profile, s.yMm));

    // CPCL EG: EG <widthBytes> <height> <x> <y> <hexdata...>
    // - widthBytes is padded to full bytes (8 dots per byte)
    // - hex data is (widthBytes * height) bytes, encoded as hex chars (2 per byte), row-major
    const paddedWidthDots = padToByteWidthDots(s.widthDots);
    const widthBytes = paddedWidthDots / 8;
    const hexLines = bitmap1bppToHexLines({
      bitmap: s.bitmap,
      widthDots: s.widthDots,
      heightDots: s.heightDots,
      paddedWidthDots,
    });

    lines.push(`EG ${widthBytes} ${s.heightDots} ${x} ${y} `);
    // Historically many printers accept the hex stream on the same line (terminated by CRLF).
    // To keep chunking more friendly, we emit it as multiple lines but without breaking the byte stream:
    // "EG ... " + <hex...> + CRLF. Each extra CRLF becomes whitespace for the parser on many dialects.
    // If a dialect is strict, set a dialect flag and join into a single line later.
    for (let i = 0; i < hexLines.length; i++) {
      lines.push(hexLines[i]!);
      if (i < hexLines.length - 1) lines.push(`\r\n`);
    }
    lines.push(`\r\n`);
  }

  for (const el of template.elements) {
    if (el.type === "qrcode") {
      const q = el as TemplateQRCodeElement;
      if (!profile.supportsNativeQRCode || !dialect.qrNative) continue;
      const x = roundDots(mmToDots(profile, q.xMm));
      const y = roundDots(mmToDots(profile, q.yMm));
      // CPCL QR syntax varies; use a common one: B QR <x> <y> M 2 U 6
      // Then data line(s) and ENDQR.
      // sizeMm -> module size heuristic:
      const sizeDots = Math.max(1, roundDots(mmToDots(profile, q.sizeMm)));
      const module = Math.max(2, Math.min(12, Math.round(sizeDots / 35)));
      const ecc = q.ecc ?? "M";
      lines.push(`B QR ${x} ${y} M ${ecc} U ${module}\r\n`);
      lines.push(utf8Bytes(q.data));
      lines.push(`\r\nENDQR\r\n`);
      usedNative.qrcode += 1;
      continue;
    }

    if (el.type === "barcode") {
      const b = el as TemplateBarcodeElement;
      if (!profile.supportsNativeBarcode) continue;
      const x = roundDots(mmToDots(profile, b.xMm));
      const y = roundDots(mmToDots(profile, b.yMm));
      const h = Math.max(1, roundDots(mmToDots(profile, b.heightMm)));
      const sym = b.symbology ?? "CODE128";
      // CPCL barcode command differs across devices; keep it conservative:
      // BARCODE <sym> <w> <r> <h> <x> <y> <data>
      // Here we output a simplified marker for dialect mapping.
      lines.push(`;BARCODE sym=${sym} x=${x} y=${y} h=${h} human=${b.humanReadable ? 1 : 0}\r\n`);
      lines.push(utf8Bytes(b.data));
      lines.push(`\r\n`);
      usedNative.barcode += 1;
      continue;
    }

    if (el.type === "text") {
      const t = el as TemplateTextElement;
      const r = normalizeRotation(t.rotationDeg ?? 0);
      const canNative = t.font.family === "builtin" && isNativeRotation(r, dialect);
      if (!canNative) continue;
      // We keep font mapping abstract; the driver must map sizeMm -> printer font ID.
      const x = roundDots(mmToDots(profile, t.xMm));
      const y = roundDots(mmToDots(profile, t.yMm));
      lines.push(
        `;TEXT builtin sizeMm=${t.font.sizeMm} rot=${r} x=${x} y=${y} align=${t.textAlign ?? "left"}\r\n`,
      );
      lines.push(utf8Bytes(t.text));
      lines.push(`\r\n`);
      usedNative.text += 1;
      continue;
    }

    if (el.type === "image") {
      // Always raster; should be included in rasterPlan (slices).
      const _img = el as TemplateImageElement;
      continue;
    }
  }

  // Footer: PRINT triggers.
  lines.push(`PRINT\r\n`);

  return {
    bytes: joinBytes(lines),
    debug: {
      pageWidthDots,
      pageHeightDots,
      usedNative,
      rasterRequired,
    },
  };
}

