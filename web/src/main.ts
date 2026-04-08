import { preparePrintJobLite } from "../../src/printing-lite.js";
import type { PrinterProfile, PrinterProtocol, Template } from "../../src/types.js";
import { chunkBytes } from "../../src/transport.js";

type LogFn = (msg: string) => void;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
}

function setStatus(text: string) {
  byId<HTMLDivElement>("status").textContent = text;
}

function appendLog(line: string) {
  const pre = byId<HTMLPreElement>("log");
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
  private services: BluetoothRemoteGATTService[] = [];
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private writeServiceUuid: string | null = null;

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
    this.services = [];
    this.writeChar = null;
    this.writeServiceUuid = null;
  }

  disconnect() {
    try {
      this.device?.gatt?.disconnect();
    } catch {
      // ignore
    }
    this.server = null;
    this.services = [];
    this.writeChar = null;
    this.writeServiceUuid = null;
  }

  async discoverServices(): Promise<BluetoothRemoteGATTService[]> {
    if (!this.server) throw new Error("Not connected");
    this.services = await this.server.getPrimaryServices();
    this.log(`Services discovered: ${this.services.length}`);
    return this.services;
  }

  async listCharacteristics(serviceUuid: string): Promise<BluetoothRemoteGATTCharacteristic[]> {
    const svc = this.services.find((s) => s.uuid === serviceUuid);
    if (!svc) throw new Error(`Service not found: ${serviceUuid}. Click 枚举服务/特征 first.`);
    const chars = await svc.getCharacteristics();
    return chars;
  }

  selectWriteCharacteristic(serviceUuid: string, char: BluetoothRemoteGATTCharacteristic) {
    this.writeChar = char;
    this.writeServiceUuid = serviceUuid;
  }

  getSelected() {
    return { serviceUuid: this.writeServiceUuid, charUuid: this.writeChar?.uuid ?? null };
  }

  async writeChunk(chunk: Uint8Array) {
    if (!this.writeChar) throw new Error("No write characteristic selected");
    // Prefer withoutResponse if available to increase throughput; but for stability you may switch to writeValueWithResponse.
    const p = this.writeChar.properties;
    if (p.writeWithoutResponse && "writeValueWithoutResponse" in this.writeChar) {
      // @ts-ignore - lib.dom typings vary by TS/target
      await this.writeChar.writeValueWithoutResponse(chunk);
    } else {
      const fn = this.writeChar.writeValueWithResponse ?? this.writeChar.writeValue;
      // Some TS/lib.dom combinations are strict about BufferSource/ArrayBufferLike; always pass ArrayBuffer.
      const ab = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
      await fn.call(this.writeChar, ab);
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

function makeProfile(protocol: PrinterProtocol): PrinterProfile {
  return {
    id: protocol === "CPCL" ? "zicox_cc4_like" : "escpos_generic",
    manufacturer: "ZICOX",
    model: "CC4",
    protocol,
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
  const btnConnect = byId<HTMLButtonElement>("btnConnect");
  const btnDisconnect = byId<HTMLButtonElement>("btnDisconnect");
  const btnDiscover = byId<HTMLButtonElement>("btnDiscover");
  const btnSend = byId<HTMLButtonElement>("btnSend");
  const selService = byId<HTMLSelectElement>("selService");
  const selWriteChar = byId<HTMLSelectElement>("selWriteChar");

  function setConnectedUi(connected: boolean) {
    btnDisconnect.disabled = !connected;
    btnDiscover.disabled = !connected;
    selService.disabled = !connected;
    selWriteChar.disabled = !connected;
    btnSend.disabled = !connected;
  }

  setConnectedUi(false);

  btnConnect.onclick = async () => {
    try {
      setStatus("Requesting device…");
      await transport.requestAndConnect();
      setStatus("Connected.");
      appendLog("Connected. Click 枚举服务/特征 to choose write characteristic.");
      setConnectedUi(true);
    } catch (e) {
      setStatus("Connect failed.");
      appendLog(String(e));
    }
  };

  btnDisconnect.onclick = async () => {
    transport.disconnect();
    setConnectedUi(false);
    selService.innerHTML = "";
    selWriteChar.innerHTML = "";
    setStatus("Disconnected.");
  };

  btnDiscover.onclick = async () => {
    try {
      setStatus("Discovering services…");
      const services = await transport.discoverServices();
      selService.innerHTML = "";
      for (const svc of services) {
        const opt = document.createElement("option");
        opt.value = svc.uuid;
        opt.textContent = svc.uuid;
        selService.appendChild(opt);
      }
      setStatus(`Services: ${services.length}. Select service to list characteristics.`);
      // Trigger initial list
      selService.dispatchEvent(new Event("change"));
    } catch (e) {
      setStatus("Discover failed.");
      appendLog(String(e));
    }
  };

  selService.onchange = async () => {
    try {
      const svcUuid = selService.value;
      if (!svcUuid) return;
      selWriteChar.innerHTML = "";
      const chars = await transport.listCharacteristics(svcUuid);
      for (const ch of chars) {
        const p = ch.properties;
        const writable = Boolean(p.write || p.writeWithoutResponse);
        const opt = document.createElement("option");
        opt.value = ch.uuid;
        opt.textContent = `${ch.uuid}  (write=${writable ? "Y" : "N"}, wwr=${p.writeWithoutResponse ? "Y" : "N"})`;
        // attach object ref via dataset index map
        (opt as any)._charRef = ch;
        if (writable) selWriteChar.appendChild(opt);
      }
      if (selWriteChar.options.length === 0) {
        appendLog(`No writable characteristics under service ${svcUuid}`);
      } else {
        // auto-select first and bind
        selWriteChar.selectedIndex = 0;
        selWriteChar.dispatchEvent(new Event("change"));
      }
    } catch (e) {
      appendLog(String(e));
    }
  };

  selWriteChar.onchange = () => {
    const svcUuid = selService.value;
    const opt = selWriteChar.selectedOptions[0] as any;
    const ch = opt?._charRef as BluetoothRemoteGATTCharacteristic | undefined;
    if (svcUuid && ch) {
      transport.selectWriteCharacteristic(svcUuid, ch);
      const sel = transport.getSelected();
      appendLog(`Selected write characteristic: svc=${sel.serviceUuid} char=${sel.charUuid}`);
    }
  };

  btnSend.onclick = async () => {
    try {
      const tpl = makeDemoTemplate();
      const protocol = (byId<HTMLSelectElement>("protocol").value as PrinterProtocol) || "CPCL";
      const profile = makeProfile(protocol);
      const job = preparePrintJobLite({
        template: tpl,
        data: { name: byId<HTMLInputElement>("name").value || "World", qrcode: byId<HTMLInputElement>("qrcode").value || "https://example.com" },
        printerProfile: profile,
        copies: Number(byId<HTMLInputElement>("copies").value || "1"),
      });
      const chunkSize = Number(byId<HTMLInputElement>("chunkBytes").value || "20");
      const interval = Number(byId<HTMLInputElement>("intervalMs").value || "20");
      const chunks = chunkBytes(job.bytes, chunkSize);
      appendLog(`Sending protocol=${job.meta.protocol} bytes=${job.bytes.length} chunks=${chunks.length} (chunk=${chunkSize}, interval=${interval}ms)`);
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

