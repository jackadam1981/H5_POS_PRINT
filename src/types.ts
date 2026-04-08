export type Mm = number;

export type ScalePolicy = "fitWidth" | "crop" | "block";

export type ElementType = "text" | "qrcode" | "barcode" | "image";

export interface TemplateCanvas {
  widthMm: Mm;
  heightMm: Mm;
  scalePolicy?: ScalePolicy;
}

export interface TemplateDataSchemaField {
  type: "string" | "number" | "boolean";
  required?: boolean;
}

export interface TemplateDataSchema {
  [key: string]: TemplateDataSchemaField;
}

export interface TemplateBaseElement {
  id: string;
  type: ElementType;
  xMm: Mm;
  yMm: Mm;
  widthMm: Mm;
  heightMm: Mm;
  rotationDeg?: number;
  zIndex?: number;
}

export interface TemplateTextElement extends TemplateBaseElement {
  type: "text";
  text: string;
  textAlign?: "left" | "center" | "right";
  font: {
    family: "builtin" | "custom";
    sizeMm: Mm;
    weight?: number;
    // For "custom" fonts. (Optional; platform-specific resolution.)
    fontRef?: string;
  };
}

export interface TemplateQRCodeElement extends TemplateBaseElement {
  type: "qrcode";
  data: string;
  sizeMm: Mm;
  ecc?: "L" | "M" | "Q" | "H";
}

export interface TemplateBarcodeElement extends TemplateBaseElement {
  type: "barcode";
  symbology: "CODE128";
  data: string;
  humanReadable?: boolean;
}

export interface TemplateImageElement extends TemplateBaseElement {
  type: "image";
  mode: "logo" | "background" | "photo";
  src: { kind: "url" | "dataUri" | "r2Key"; value: string };
}

export type TemplateElement =
  | TemplateTextElement
  | TemplateQRCodeElement
  | TemplateBarcodeElement
  | TemplateImageElement;

export interface Template {
  id: string;
  name: string;
  unit: "mm";
  canvas: TemplateCanvas;
  elements: TemplateElement[];
  dataSchema?: TemplateDataSchema;
}

export interface PrinterProfile {
  id: string;
  manufacturer: string;
  model: string;
  protocol: "CPCL";
  printableWidthMm: Mm;
  supportsNativeQRCode: boolean;
  supportsNativeBarcode: boolean;

  // One of these should be populated after certification.
  dpi?: number | null;
  mmToDotScale?: number | null;

  imageConstraints?: {
    // maxAspect w:h, default 9:16
    maxAspect?: { w: number; h: number };
  };

  cpclDialect?: {
    textRotationNative?: number[]; // e.g. [0,90,180,270]
    qrNative?: boolean;
  };

  ble: {
    serviceUUID: string | null;
    writeCharacteristicUUID: string | null;
    notifyCharacteristicUUID?: string | null;
    writeMode?: "withResponse" | "withoutResponse";
    packetIntervalMs?: number;
    maxChunkBytes?: number | null;
    retry?: {
      maxAttempts: number;
      backoffMs: number[];
    };
  };
}

export interface PrintJobInput {
  template: Template;
  data: Record<string, unknown>;
  printerProfile: PrinterProfile;
  copies?: number;
}

export interface PreparedJob {
  bytes: Uint8Array;
  meta: {
    scale: number;
    canvasWidthMm: number;
    printableWidthMm: number;
    copies: number;
  };
}

// Resolved types (after {{var}} replacement)
export type TemplateResolvedElement = TemplateElement;
export interface TemplateResolved extends Omit<Template, "elements"> {
  elements: TemplateResolvedElement[];
}

export type RasterizeMode = "logo" | "background" | "photo";

export type RasterImageSlice = {
  xMm: number;
  yMm: number;
  /** Width in dots (pixels). Must be a multiple of 8. */
  widthDots: number;
  /** Height in dots (pixels). */
  heightDots: number;
  /** 1bpp bitmap, row-major, bytes per row = widthDots/8. */
  bitmap1bpp: Uint8Array;
};

