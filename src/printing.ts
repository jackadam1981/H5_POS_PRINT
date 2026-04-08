import type { PreparedJob, PrintJobInput, PrinterProfile, Template } from "./types.js";
import { resolveTemplate } from "./template.js";
import { applyFitWidth } from "./scale.js";
import { compileCpclJob } from "./cpcl.js";
import { rasterizeTemplateToSlices } from "./raster.js";
import { compileEscPosReceipt } from "./escpos.js";

/**
 * Prepare a printable CPCL job bytes stream.
 *
 * Notes:
 * - Rasterization is intentionally not implemented yet (images/custom fonts/any-angle rotation).
 * - This function still produces a valid CPCL-ish stream for native elements (text/qrcode/barcode)
 *   and includes placeholder markers for future dialect handlers.
 */
export function prepareCpclPrintJob(input: PrintJobInput): PreparedJob {
  const copies = input.copies ?? 1;
  const resolved = resolveTemplate(input.template, input.data);
  const { scale, scaled } = applyFitWidth(resolved, input.printerProfile);

  const rasterPlan = rasterizeTemplateToSlices({
    template: scaled,
    profile: input.printerProfile,
  });

  const compiled = compileCpclJob({
    template: scaled,
    profile: input.printerProfile,
    copies,
    rasterPlan,
  });

  return {
    bytes: compiled.bytes,
    meta: {
      scale,
      canvasWidthMm: input.template.canvas.widthMm,
      printableWidthMm: input.printerProfile.printableWidthMm,
      copies,
      protocol: "CPCL",
    },
  };
}

/**
 * Unified entry: choose protocol compiler by printer profile.
 */
export function preparePrintJob(input: PrintJobInput): PreparedJob {
  if (input.printerProfile.protocol === "CPCL") return prepareCpclPrintJob(input);

  // ESC/POS receipts: treat template's elements as "lines" for now (MVP).
  // The full receipt layout engine (chars-per-line, wrapping, columns, QR, etc.) is next iteration.
  const resolved = resolveTemplate(input.template, input.data);
  const lines = resolved.elements
    .filter((e) => e.type === "text")
    .map((t) => {
      const textEl = t as any;
      return {
        text: String(textEl.text ?? ""),
        align: textEl.textAlign ?? "left",
        bold: (textEl.font?.weight ?? 400) >= 600,
        sizeW: 1 as const,
        sizeH: 1 as const,
      };
    });

  const compiledBytes = compileEscPosReceipt(lines, { feedLines: 3, finalLf: true });

  return {
    bytes: compiledBytes,
    meta: {
      scale: 1,
      canvasWidthMm: input.template.canvas.widthMm,
      printableWidthMm: input.printerProfile.printableWidthMm,
      copies: input.copies ?? 1,
      protocol: "ESCPOS",
    },
  };
}

export type { Template, PrinterProfile };

