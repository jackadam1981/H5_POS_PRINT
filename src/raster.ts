import type { PrinterProfile, TemplateImageElement, TemplateResolved } from "./types.js";
import type { RasterImageSlice } from "./cpcl.js";
import { mmToDots, roundDots } from "./mm.js";
import { PNG } from "pngjs";
import { bitmap1bppToHexLines } from "./bitmap.js";

export type DitherMode = "threshold" | "floydSteinberg";
export type ImageMode = "logo" | "background" | "photo";

export type RasterizeOptions = {
  widthDots: number;
  heightDots: number;
  /** RGBA bytes length must be widthDots*heightDots*4 */
  rgba: Uint8Array;
  /** How to interpret pixels as black/white. */
  ditherMode?: DitherMode;
  /**
   * Threshold in [0,255]. Lower => more black.
   * Used for threshold; also acts as baseline for photo modes.
   */
  threshold?: number;
  /** Affects dithering aggressiveness; 1.0 = neutral */
  gamma?: number;
};

function clamp01(x: number) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function srgbToLinear01(s: number): number {
  // s in [0,1]
  if (s <= 0.04045) return s / 12.92;
  return Math.pow((s + 0.055) / 1.055, 2.4);
}

function linearToSrgb01(l: number): number {
  if (l <= 0.0031308) return 12.92 * l;
  return 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
}

function luminanceByte(r: number, g: number, b: number, gamma = 1): number {
  // Convert to linear luminance, apply optional gamma, return back to [0,255] sRGB-ish.
  const rl = srgbToLinear01(r / 255);
  const gl = srgbToLinear01(g / 255);
  const bl = srgbToLinear01(b / 255);
  let y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  if (gamma !== 1) y = Math.pow(clamp01(y), 1 / gamma);
  const s = linearToSrgb01(clamp01(y));
  return Math.round(s * 255);
}

function unpackRgbaToLuma(opts: RasterizeOptions): Float32Array {
  const { widthDots, heightDots, rgba, gamma } = opts;
  const out = new Float32Array(widthDots * heightDots);
  const g = gamma ?? 1;
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const r = rgba[p] ?? 255;
    const gg = rgba[p + 1] ?? 255;
    const b = rgba[p + 2] ?? 255;
    const a = rgba[p + 3] ?? 255;
    // Alpha blend on white background.
    const alpha = (a / 255) * 1.0;
    const y = luminanceByte(r, gg, b, g);
    const blended = y * alpha + 255 * (1 - alpha);
    out[i] = blended;
  }
  return out;
}

export function rasterizeTo1bpp(opts: RasterizeOptions): Uint8Array {
  const { widthDots, heightDots } = opts;
  if (opts.rgba.length !== widthDots * heightDots * 4) {
    throw new Error("RGBA length mismatch for rasterization.");
  }

  const ditherMode: DitherMode = opts.ditherMode ?? "floydSteinberg";
  const threshold = opts.threshold ?? 128;
  const luma = unpackRgbaToLuma(opts);

  // Output is packed bits, MSB first per byte, row-major.
  const rowBytes = Math.ceil(widthDots / 8);
  const out = new Uint8Array(rowBytes * heightDots);

  if (ditherMode === "threshold") {
    for (let y = 0; y < heightDots; y++) {
      for (let x = 0; x < widthDots; x++) {
        const idx = y * widthDots + x;
        const v = luma[idx]!;
        const isBlack = v < threshold;
        if (isBlack) {
          const bIdx = y * rowBytes + (x >> 3);
          const bit = 7 - (x & 7);
          out[bIdx] = out[bIdx]! | (1 << bit);
        }
      }
    }
    return out;
  }

  // Floyd–Steinberg error diffusion, operates in-place on float luma.
  for (let y = 0; y < heightDots; y++) {
    for (let x = 0; x < widthDots; x++) {
      const idx = y * widthDots + x;
      const old = luma[idx]!;
      const newVal = old < threshold ? 0 : 255;
      const err = old - newVal;
      luma[idx] = newVal;

      if (newVal === 0) {
        const bIdx = y * rowBytes + (x >> 3);
        const bit = 7 - (x & 7);
        out[bIdx] = out[bIdx]! | (1 << bit);
      }

      // Distribute error
      // (x+1, y)   7/16
      // (x-1, y+1) 3/16
      // (x,   y+1) 5/16
      // (x+1, y+1) 1/16
      if (x + 1 < widthDots) luma[idx + 1] = luma[idx + 1]! + (err * 7) / 16;
      if (y + 1 < heightDots) {
        const below = idx + widthDots;
        if (x > 0) luma[below - 1] = luma[below - 1]! + (err * 3) / 16;
        luma[below] = luma[below]! + (err * 5) / 16;
        if (x + 1 < widthDots) luma[below + 1] = luma[below + 1]! + (err * 1) / 16;
      }
    }
  }

  return out;
}

export function defaultRasterizeOptionsForMode(mode: ImageMode): Pick<RasterizeOptions, "ditherMode" | "threshold" | "gamma"> {
  // Tuned for typical thermal printers: favor legibility for logos, smoother dithering for photos.
  switch (mode) {
    case "logo":
      return { ditherMode: "threshold", threshold: 160, gamma: 1 };
    case "background":
      return { ditherMode: "floydSteinberg", threshold: 190, gamma: 1 };
    case "photo":
      return { ditherMode: "floydSteinberg", threshold: 175, gamma: 1.2 };
  }
}

export function slice1bppBitmap(params: {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  widthDots: number;
  heightDots: number;
  /** Packed 1bpp row-major data. */
  bitmap1bpp: Uint8Array;
  sliceHeightDots: number;
}): RasterImageSlice[] {
  const { sliceHeightDots } = params;
  if (sliceHeightDots <= 0) throw new Error("sliceHeightDots must be > 0");
  const rowBytes = Math.ceil(params.widthDots / 8);
  if (params.bitmap1bpp.length !== rowBytes * params.heightDots) {
    throw new Error("bitmap1bpp length mismatch for slicing.");
  }

  const slices: RasterImageSlice[] = [];
  const totalSlices = Math.ceil(params.heightDots / sliceHeightDots);
  for (let s = 0; s < totalSlices; s++) {
    const y0 = s * sliceHeightDots;
    const h = Math.min(sliceHeightDots, params.heightDots - y0);
    const bytes = new Uint8Array(rowBytes * h);
    const srcOffset = y0 * rowBytes;
    bytes.set(params.bitmap1bpp.subarray(srcOffset, srcOffset + rowBytes * h));
    const slice: RasterImageSlice = {
      xMm: params.xMm,
      yMm: params.yMm + (params.heightMm * y0) / params.heightDots,
      widthMm: params.widthMm,
      heightMm: (params.heightMm * h) / params.heightDots,
      bitmap: bytes,
      widthDots: params.widthDots,
      heightDots: h,
    };
    slices.push(slice);
  }
  return slices;
}

export { bitmap1bppToHexLines };

function parseDataUriPng(dataUri: string): { width: number; height: number; rgba: Uint8Array } {
  const m = /^data:image\/png(?:;charset=[^;]+)?;base64,(.+)$/i.exec(dataUri);
  if (!m) throw new Error("Only data:image/png;base64,... is supported in raster demo implementation.");
  const b64 = m[1]!.replace(/\s+/g, "");
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
  const buf = Buffer.from(padded, "base64");
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, rgba: png.data };
}

function nearestScaleRgba(params: {
  srcRgba: Uint8Array;
  srcW: number;
  srcH: number;
  dstW: number;
  dstH: number;
}): Uint8Array {
  const { srcRgba, srcW, srcH, dstW, dstH } = params;
  const out = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y + 0.5) * (srcH / dstH)));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x + 0.5) * (srcW / dstW)));
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      out[di] = srcRgba[si]!;
      out[di + 1] = srcRgba[si + 1]!;
      out[di + 2] = srcRgba[si + 2]!;
      out[di + 3] = srcRgba[si + 3]!;
    }
  }
  return out;
}

function padWidthDotsToByte(widthDots: number): number {
  return Math.ceil(widthDots / 8) * 8;
}

/**
 * Rasterize template images into 1bpp slices (prototype).
 *
 * Notes:
 * - Only `image.src.kind=dataUri` with PNG is implemented here to keep the core self-contained.
 * - URL/R2 fetch is expected to be handled by the caller (mini program/H5) and then provided as dataUri/rgba.
 */
export function rasterizeTemplateToSlices(params: {
  template: TemplateResolved;
  profile: PrinterProfile;
  sliceHeightDots?: number;
}): { slices: RasterImageSlice[]; rasterRequiredCount: { image: number; text: number } } {
  const { template, profile } = params;
  const sliceHeightDots = params.sliceHeightDots ?? 24;

  const slices: RasterImageSlice[] = [];
  let imageCount = 0;

  for (const el of template.elements) {
    if (el.type !== "image") continue;
    imageCount++;
    const img = el as TemplateImageElement;
    if (img.src.kind !== "dataUri") {
      // Not supported in this core demo; leave to platform fetch.
      continue;
    }
    const decoded = parseDataUriPng(img.src.value);
    const widthDots = Math.max(1, roundDots(mmToDots(profile, img.widthMm)));
    const heightDots = Math.max(1, roundDots(mmToDots(profile, img.heightMm)));

    const scaledRgba = nearestScaleRgba({
      srcRgba: decoded.rgba,
      srcW: decoded.width,
      srcH: decoded.height,
      dstW: widthDots,
      dstH: heightDots,
    });

    const preset = defaultRasterizeOptionsForMode(img.mode);
    const bitmapPacked = rasterizeTo1bpp({
      widthDots,
      heightDots,
      rgba: scaledRgba,
      ...preset,
    });

    const paddedWidthDots = padWidthDotsToByte(widthDots);
    const rowBytes = paddedWidthDots / 8;
    // Ensure bitmap is padded to byte-aligned width
    const padded = new Uint8Array(rowBytes * heightDots);
    const srcRowBytes = Math.ceil(widthDots / 8);
    for (let y = 0; y < heightDots; y++) {
      const srcOff = y * srcRowBytes;
      const dstOff = y * rowBytes;
      padded.set(bitmapPacked.subarray(srcOff, srcOff + srcRowBytes), dstOff);
    }

    const imgSlices = slice1bppBitmap({
      xMm: img.xMm,
      yMm: img.yMm,
      widthMm: img.widthMm,
      heightMm: img.heightMm,
      widthDots: paddedWidthDots,
      heightDots,
      bitmap1bpp: padded,
      sliceHeightDots,
    });
    slices.push(...imgSlices);
  }

  return {
    slices,
    rasterRequiredCount: { image: imageCount, text: 0 },
  };
}

