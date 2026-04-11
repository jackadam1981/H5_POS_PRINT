import type { PreparedJob, PrintJobInput, PrinterProfile, Template } from "./types.js";
import { resolveTemplate } from "./template.js";
import { applyFitWidth } from "./scale.js";
import { compileCpclJob } from "./cpcl.js";
import { compileEscPosReceipt } from "./escpos.js";

/**
 * Browser-friendly print job preparation.
 *
 * Differences vs `preparePrintJob`:
 * - CPCL path does NOT rasterize images/custom fonts/any-angle rotation.
 * - This avoids Node-only deps (pngjs/Buffer) so that Android H5 can focus on Web Bluetooth testing.
 *
 * Use this for early H5 validation: connect → write bytes → printer reacts.
 */
export function preparePrintJobLite(input: PrintJobInput): PreparedJob {
  const copies = input.copies ?? 1;
  const resolved = resolveTemplate(input.template, input.data);

  if (input.printerProfile.protocol === "CPCL") {
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
        protocol: "CPCL",
      },
    };
  }

  // ESCPOS: treat template's text elements as lines (MVP).
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
      copies,
      protocol: "ESCPOS",
    },
  };
}

export type { Template, PrinterProfile };

