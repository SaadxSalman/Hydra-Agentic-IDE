/**
 * Minimal GGUF v3 header/metadata parser (read-only, first 64 KiB).
 * Extracts architecture/name/context without loading tensors — enough for
 * the IDE "Model Info" panel.
 */

import { open, stat } from 'node:fs/promises';
import { TextDecoder } from 'node:util';

export interface ModelInfo {
  path: string;
  exists: boolean;
  sizeBytes: number;
  format: string;
  version: number | null;
  architecture: string | null;
  name: string | null;
  contextLength: number | null;
  quantization: string | null;
  fileType: string | null;
  tensorCount: number | null;
  metadataCount: number;
}

const GGUF_MAGIC = 0x46554747; // 'GGUF' little-endian

interface ParsedValue {
  bytes: number;
  text?: string;
  u32?: number;
}

const decoder = new TextDecoder('utf-8', { ignoreErrors: true });

function utf8(buf: Uint8Array, start: number, len: number): string {
  return decoder.decode(buf.slice(start, start + len));
}

function numberFrom(v: ParsedValue): number | null {
  return v.u32 ?? (v.text ? parseInt(v.text, 10) : null);
}

/**
 * Read the model file header. Only metadata is parsed (bounded read).
 */
export async function parseGguf(path: string): Promise<ModelInfo> {
  const base: ModelInfo = {
    path, exists: false, sizeBytes: 0, format: 'unknown', version: null,
    architecture: null, name: null, contextLength: null, quantization: null,
    fileType: null, tensorCount: null, metadataCount: 0,
  };

  try {
    base.sizeBytes = (await stat(path)).size;
    base.exists = base.sizeBytes > 0;
    if (!base.exists) return base;

    const h = await open(path, 'r');
    try {
      const head = new Uint8Array(64 * 1024);
      const { bytesRead } = await h.read(head, 0, head.byteLength, 0);
      if (bytesRead < 16) return base;

      const view = new DataView(head.buffer, head.byteOffset, bytesRead);
      if (view.getUint32(0, true) !== GGUF_MAGIC) return base;

      base.format = 'GGUF';
      base.version = view.getUint32(4, true);
      base.tensorCount = view.getUint64(8, true);
      let offset = 16;
      let metadataCount = 0;
      const guard = 3000;

      while (offset + 2 <= bytesRead && metadataCount < guard) {
        const keyLen = view.getUint64(offset, true); offset += 8;
        if (offset + keyLen > bytesRead) break;
        const key = utf8(head, offset, keyLen); offset += keyLen;
        const vType = view.getUint32(offset, true); offset += 4;
        const value = await readValue(view, head, offset, vType, bytesRead);
        if (value === undefined) break;
        offset += value.bytes;
        metadataCount++;

        switch (key) {
          case 'general.architecture': base.architecture = value.text; break;
          case 'general.name': base.name = value.text; break;
          case 'general.file_type': base.fileType = value.text ?? (value.u32 ? value.u32.toString() : undefined); break;
          case 'llama.context_length': base.contextLength = numberFrom(value) ?? base.contextLength; break;
          case 'general.quantization_version': base.quantization = value.u32 ? `Q${value.u32}` : base.quantization; break;
        }
      }

      base.metadataCount = metadataCount;
      if (base.architecture && base.architecture.toUpperCase().includes('LFM')) {
        base.quantization = base.quantization ?? 'Q4_0';
      }
      return base;
    } finally {
      await h.close();
    }
  } catch {
    return base;
  }
}

async function readValue(
  view: DataView,
  bytes: Uint8Array,
  offset: number,
  type: number,
  limit: number,
): Promise<ParsedValue | undefined> {
  switch (type) {
    case 0: case 1: case 2: case 3:        // u8, i8, u16, i16
      return offset + 2 <= limit ? { bytes: 2 } : undefined;
    case 4: {                               // u32
      if (offset + 4 > limit) return undefined;
      return { bytes: 4, u32: view.getUint32(offset, true) };
    }
    case 5: case 6: case 7:                // i32, f32, bool
      return offset + 4 <= limit ? { bytes: 4 } : undefined;
    case 8: {                              // string
      if (offset + 8 > limit) return undefined;
      const len = view.getUint64(offset, true);
      if (offset + 8 + len > limit) return undefined;
      return { bytes: 8 + len, text: utf8(bytes, offset + 8, len) };
    }
    case 9: return { bytes: 8 };           // array (skip)
    case 10: {                             // u64
      if (offset + 8 > limit) return undefined;
      return { bytes: 8, u32: Number(view.getUint64(offset, true) & 0xffffffff) };
    }
    case 11: case 12: return { bytes: 8 }; // i64, f64
    default: return undefined;
  }
}