import type { PrinterProfile } from "./types.js";

export function mmToDots(profile: PrinterProfile, mm: number): number {
  const scale = profile.mmToDotScale ?? (profile.dpi != null ? profile.dpi / 25.4 : null);
  if (scale == null) {
    throw new Error("PrinterProfile missing mmToDotScale/dpi; run calibration first.");
  }
  return mm * scale;
}

export function mmToDotsInt(profile: PrinterProfile, mm: number): number {
  // CPCL expects integer dots; rounding is less biased than floor/ceil.
  return Math.round(mmToDots(profile, mm));
}

export function roundDots(dots: number): number {
  return Math.round(dots);
}

