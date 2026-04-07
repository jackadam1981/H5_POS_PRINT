import type { PrinterProfile } from './types';

export type TransportWriteOptions = {
  /** Chunk size in bytes. If omitted, uses profile.ble.maxChunkBytes or 20. */
  maxChunkBytes?: number;
  /** Delay between chunks. If omitted, uses profile.ble.packetIntervalMs or 20. */
  packetIntervalMs?: number;
  /** Max retry attempts per chunk. If omitted, uses profile.ble.retry.maxAttempts or 3. */
  maxAttempts?: number;
  /** Backoff schedule (ms). If omitted, uses profile.ble.retry.backoffMs or [100,200,400]. */
  backoffMs?: number[];
};

export type WriteResult =
  | { ok: true; bytesWritten: number; chunks: number }
  | { ok: false; error: string; bytesWritten: number; chunks: number };

export interface Transport {
  /** Open a session / ensure connected. */
  connect(): Promise<void>;
  /** Write a single chunk to the printer. */
  writeChunk(chunk: Uint8Array): Promise<void>;
  /** Close connection if needed. */
  disconnect(): Promise<void>;
}

export function getTransportWriteOptions(
  profile: PrinterProfile,
  override?: TransportWriteOptions,
): Required<TransportWriteOptions> {
  const maxChunkBytes = override?.maxChunkBytes ?? profile.ble.maxChunkBytes ?? 20;
  const packetIntervalMs = override?.packetIntervalMs ?? profile.ble.packetIntervalMs ?? 20;
  const maxAttempts = override?.maxAttempts ?? profile.ble.retry?.maxAttempts ?? 3;
  const backoffMs = override?.backoffMs ?? profile.ble.retry?.backoffMs ?? [100, 200, 400];
  return { maxChunkBytes, packetIntervalMs, maxAttempts, backoffMs };
}

export function chunkBytes(bytes: Uint8Array, chunkSize: number): Uint8Array[] {
  if (chunkSize <= 0) throw new Error('chunkSize must be > 0');
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(bytes.subarray(i, Math.min(bytes.length, i + chunkSize)));
  }
  return chunks;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry<T>(fn: () => Promise<T>, maxAttempts: number, backoffMs: number[]): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const delay = backoffMs[Math.min(backoffMs.length - 1, attempt - 1)] ?? 0;
      if (attempt < maxAttempts && delay > 0) await sleep(delay);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Reliable writer: chunk + interval + per-chunk retry.
 * Note: MTU discovery is platform-specific and must be wired via profile/override.
 */
export async function writeJobBytes(
  transport: Transport,
  profile: PrinterProfile,
  bytes: Uint8Array,
  override?: TransportWriteOptions,
): Promise<WriteResult> {
  const opt = getTransportWriteOptions(profile, override);
  const chunks = chunkBytes(bytes, opt.maxChunkBytes);

  let bytesWritten = 0;
  let chunksWritten = 0;
  try {
    await transport.connect();
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      await retry(() => transport.writeChunk(chunk), opt.maxAttempts, opt.backoffMs);
      bytesWritten += chunk.length;
      chunksWritten += 1;
      if (opt.packetIntervalMs > 0 && i < chunks.length - 1) {
        await sleep(opt.packetIntervalMs);
      }
    }
    return { ok: true, bytesWritten, chunks: chunksWritten };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), bytesWritten, chunks: chunksWritten };
  } finally {
    try {
      await transport.disconnect();
    } catch {
      // ignore
    }
  }
}

