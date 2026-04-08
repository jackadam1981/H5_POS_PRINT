import type { PrinterProfile, Template } from "./types.js";

export type FitWidthResult = {
  scale: number;
  scaled: Template;
  notes: string[];
};

function cloneTemplate(tpl: Template): Template {
  return JSON.parse(JSON.stringify(tpl)) as Template;
}

export function computeFitWidthScale(template: Template, profile: PrinterProfile): number {
  const canvasWidth = template.canvas.widthMm;
  const printableWidth = profile.printableWidthMm;
  if (!(canvasWidth > 0) || !(printableWidth > 0)) return 1;
  return Math.min(1, printableWidth / canvasWidth);
}

export function applyFitWidth(template: Template, profile: PrinterProfile): FitWidthResult {
  const notes: string[] = [];
  const scale = computeFitWidthScale(template, profile);
  const scaled = cloneTemplate(template);

  if (template.canvas.scalePolicy !== "fitWidth") {
    notes.push(`scalePolicy=${template.canvas.scalePolicy}; no-op scaling applied`);
    return { scale: 1, scaled, notes };
  }

  if (scale >= 1) return { scale, scaled, notes };

  // Scale canvas for preview. Height is intentionally scaled so that relative layout stays consistent.
  scaled.canvas.widthMm = template.canvas.widthMm * scale;
  scaled.canvas.heightMm = template.canvas.heightMm * scale;

  for (const el of scaled.elements) {
    el.xMm *= scale;
    el.yMm *= scale;
    el.widthMm *= scale;
    el.heightMm *= scale;

    if (el.type === "text") {
      el.font.sizeMm *= scale;
    }
    if (el.type === "qrcode") {
      el.sizeMm *= scale;
    }
    if (el.type === "barcode") {
      el.heightMm *= scale;
    }
  }

  notes.push(`fitWidth: scaled by ${(scale * 100).toFixed(1)}% for ${profile.manufacturer} ${profile.model}`);
  return { scale, scaled, notes };
}

