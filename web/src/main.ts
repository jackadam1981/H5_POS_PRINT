import { prepareCpclPrintJob } from "../../src/printing.js";
import type { PrinterProfile, Template } from "../../src/types.js";
import { chunkBytes } from "../../src/transport.js";

type LogFn = (msg: string) => void;

function $(sel: string) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el as HTMLElement;
}

function setStatus(text: string) {
  ($(".status") as HTMLDivElement).textContent = text;
}

function appendLog(line: string) {
  const pre = $(".log") as HTMLPreElement;
  pre.textContent += (pre.textContent ? "\n" : "") + line;
}

function bytesToHexPreview(bytes: Uint8Array, max = 64) {
  const n = Math.min(bytes.length, max);
  let s = "";
  for (let i = 0; i < n; i++) s += bytes[i]!.toString(16).padStart(2, "0");
  return s;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Minimal Web Bluetooth writer (Android Chrome).
 * This is for testing. Production code should include reconnect, notifications, and better error typing.
 */
class WebBluetoothTransport {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;

  constructor(private log: LogFn) {}

  async requestAndConnect(filters?: BluetoothRequestDeviceFilter[]) {
    if (!navigator.bluetooth) throw new Error("Web Bluetooth not supported in this browser.");
    this.device = await navigator.bluetooth.requestDevice({
      // In practice you should filter by namePrefix or service UUID. For lab testing we allow all.
      filters: filters?.length ? filters : undefined,
      acceptAllDevices: !filters?.length,
      optionalServices: [], // can be filled after identifying printer service UUID
    });
    this.log(`Selected device: ${this.device.name ?? "(no name)"} (${this.device.id})`);
    this.server = await this.device.gatt!.connect();
  }

  async pickWritableCharacteristic() {
    if (!this.server) throw new Error("Not connected");
    const services = await this.server.getPrimaryServices();
    this.log(`Services: ${services.length}`);
    for (const svc of services) {
      const chars = await svc.getCharacteristics();
      for (const ch of chars) {
        const p = ch.properties;
        if (p.write || p.writeWithoutResponse) {
          this.writeChar = ch;
          this.log(`Writable char found: svc=${svc.uuid} char=${ch.uuid} (write=${p.write}, wwr=${p.writeWithoutResponse})`);
          return;
        }
      }
    }
    throw new Error("No writable characteristic found. Need correct service/char UUID from certification.");
  }

  async writeChunk(chunk: Uint8Array) {
    if (!this.writeChar) throw new Error("No write characteristic selected");
    // Prefer withoutResponse if available to increase throughput; but for stability you may switch to writeValueWithResponse.
    const p = this.writeChar.properties;
    if (p.writeWithoutResponse && "writeValueWithoutResponse" in this.writeChar) {
      // @ts-ignore - lib.dom typings vary by TS/target
      await this.writeChar.writeValueWithoutResponse(chunk);
    } else {
      await this.writeChar.writeValueWithResponse(chunk);
    }
  }
}

function makeDemoTemplate(): Template {
  return {
    id: "tpl_h5_demo",
    name: "H5 Demo",
    unit: "mm",
    canvas: { widthMm: 110, heightMm: 60, scalePolicy: "fitWidth" },
    elements: [
      {
        id: "t1",
        type: "text",
        xMm: 6,
        yMm: 6,
        widthMm: 90,
        heightMm: 10,
        rotationDeg: 0,
        text: "H5 CPCL TEST {{name}}",
        font: { family: "builtin", sizeMm: 6 },
      },
      {
        id: "qr1",
        type: "qrcode",
        xMm: 70,
        yMm: 18,
        widthMm: 28,
        heightMm: 28,
        sizeMm: 28,
        rotationDeg: 0,
        data: "{{qrcode}}",
        ecc: "M",
      },
    ],
  };
}

function makeCc4LikeProfile(): PrinterProfile {
  return {
    id: "zicox_cc4_like",
    manufacturer: "ZICOX",
    model: "CC4",
    protocol: "CPCL",
    printableWidthMm: 104,
    supportsNativeQRCode: true,
    supportsNativeBarcode: true,
    // For lab test only. Real project should calibrate and store mmToDotScale.
    mmToDotScale: 8,
    ble: {
      serviceUUID: null,
      writeCharacteristicUUID: null,
      writeMode: "withoutResponse",
      packetIntervalMs: 20,
      maxChunkBytes: 20,
      retry: { maxAttempts: 3, backoffMs: [100, 200, 400] },
    },
  };
}

async function main() {
  setStatus("Ready");

  const transport = new WebBluetoothTransport(appendLog);

  ($(".btn-connect") as HTMLButtonElement).onclick = async () => {
    try {
      setStatus("Requesting device…");
      await transport.requestAndConnect();
      setStatus("Connected. Scanning characteristics…");
      await transport.pickWritableCharacteristic();
      setStatus("Connected & ready to write.");
    } catch (e) {
      setStatus("Connect failed.");
      appendLog(String(e));
    }
  };

  ($(".btn-generate") as HTMLButtonElement).onclick = async () => {
    try {
      const tpl = makeDemoTemplate();
      const profile = makeCc4LikeProfile();
      const job = prepareCpclPrintJob({
        template: tpl,
        data: { name: (document.querySelector(".name") as HTMLInputElement).value || "World", qrcode: "https://example.com" },
        printerProfile: profile,
        copies: 1,
      });
      (document.querySelector(".bytes") as HTMLTextAreaElement).value = bytesToHexPreview(job.bytes, 1024);
      appendLog(`Generated CPCL bytes=${job.bytes.length} scale=${job.meta.scale.toFixed(4)}`);
      appendLog(`First bytes hex=${bytesToHexPreview(job.bytes, 40)}`);
    } catch (e) {
      appendLog(String(e));
    }
  };

  ($(".btn-send") as HTMLButtonElement).onclick = async () => {
    try {
      const tpl = makeDemoTemplate();
      const profile = makeCc4LikeProfile();
      const job = prepareCpclPrintJob({
        template: tpl,
        data: { name: (document.querySelector(".name") as HTMLInputElement).value || "World", qrcode: "https://example.com" },
        printerProfile: profile,
        copies: 1,
      });
      const chunkSize = Number((document.querySelector(".chunk") as HTMLInputElement).value || "20");
      const interval = Number((document.querySelector(".interval") as HTMLInputElement).value || "20");
      const chunks = chunkBytes(job.bytes, chunkSize);
      appendLog(`Sending ${chunks.length} chunks (chunkSize=${chunkSize}, interval=${interval}ms)`);
      setStatus("Sending…");
      for (let i = 0; i < chunks.length; i++) {
        await transport.writeChunk(chunks[i]!);
        if (interval > 0 && i < chunks.length - 1) await sleep(interval);
      }
      setStatus("Sent.");
      appendLog("Done.");
    } catch (e) {
      setStatus("Send failed.");
      appendLog(String(e));
    }
  };
}

main().catch((e) => {
  setStatus("Init failed");
  appendLog(String(e));
});

