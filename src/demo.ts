import { chunkBytes } from "./transport.js";
import { prepareCpclPrintJob } from "./printing.js";
import type { PrinterProfile, Template } from "./types.js";
import { PNG } from "pngjs";

function makeDemoPngDataUri(params: { w: number; h: number }): string {
  const png = new PNG({ width: params.w, height: params.h });
  // Draw a simple black diagonal on white background.
  for (let y = 0; y < params.h; y++) {
    for (let x = 0; x < params.w; x++) {
      const i = (y * params.w + x) << 2;
      const isBlack = x === y || x === params.w - y - 1;
      const v = isBlack ? 0 : 255;
      png.data[i] = v;
      png.data[i + 1] = v;
      png.data[i + 2] = v;
      png.data[i + 3] = 255;
    }
  }
  const buf = PNG.sync.write(png);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

const tpl: Template = {
  id: "tpl_demo",
  name: "Demo",
  unit: "mm",
  canvas: { widthMm: 110, heightMm: 60, scalePolicy: "fitWidth" },
  elements: [
    {
      id: "bg",
      type: "image",
      xMm: 0,
      yMm: 0,
      widthMm: 104,
      heightMm: 58,
      rotationDeg: 0,
      mode: "background",
      // Generate a valid tiny PNG data URI for demo.
      src: { kind: "dataUri", value: makeDemoPngDataUri({ w: 32, h: 32 }) },
    },
    {
      id: "t1",
      type: "text",
      xMm: 6,
      yMm: 6,
      widthMm: 80,
      heightMm: 10,
      rotationDeg: 0,
      text: "Hello {{name}}",
      font: { family: "builtin", sizeMm: 6, weight: 600 },
    },
    {
      id: "qr1",
      type: "qrcode",
      xMm: 70,
      yMm: 20,
      widthMm: 28,
      heightMm: 28,
      sizeMm: 28,
      rotationDeg: 0,
      data: "{{qrcode}}",
      ecc: "M",
    },
  ],
};

const profile: PrinterProfile = {
  id: "zicox_cc4",
  manufacturer: "ZICOX",
  model: "CC4",
  protocol: "CPCL",
  printableWidthMm: 104,
  supportsNativeQRCode: true,
  supportsNativeBarcode: true,
  mmToDotScale: 8, // assume 203dpi-ish for demo; certification should calibrate
  ble: {
    serviceUUID: null,
    writeCharacteristicUUID: null,
    writeMode: "withResponse",
    packetIntervalMs: 20,
    maxChunkBytes: 20,
    retry: { maxAttempts: 3, backoffMs: [100, 200, 400] },
  },
};

const job = prepareCpclPrintJob({
  template: tpl,
  data: { name: "World", qrcode: "https://example.com" },
  printerProfile: profile,
  copies: 1,
});

console.log("Prepared bytes:", job.bytes.length, "scale:", job.meta.scale);
const chunks = chunkBytes(job.bytes, 20);
const first = chunks[0] ?? new Uint8Array();
const firstHex = Array.from(first)
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("")
  .slice(0, 40);
console.log("Chunks:", chunks.length, "first chunk:", firstHex);
