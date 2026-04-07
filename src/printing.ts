import type { PreparedJob, PrintJobInput, PrinterProfile, Template } from "./types";
import { resolveTemplate } from "./template";
import { applyFitWidth } from "./scale";
import { compileCpclJob } from "./cpcl";

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

  const compiled = compileCpclJob({
    template: scaled,
    profile: input.printerProfile,
    copies,
    rasterPlan: {
      slices: [],
      rasterRequiredCount: { image: 0, text: 0 },
    },
  });

  return {
    bytes: compiled.bytes,
    meta: {
      scale,
      canvasWidthMm: input.template.canvas.widthMm,
      printableWidthMm: input.printerProfile.printableWidthMm,
      copies,
    },
  };
}

export type { Template, PrinterProfile };

