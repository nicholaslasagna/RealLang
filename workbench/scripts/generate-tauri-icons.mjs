#!/usr/bin/env node
/**
 * Generate minimal placeholder icons for the Tauri bundle (0.6 skeleton).
 * Replace with branded assets before release packaging.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "src-tauri", "icons");
mkdirSync(iconsDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function pngRgba(size, r, g, b, a = 255) {
  const row = Buffer.alloc(1 + size * 4);
  const raw = Buffer.alloc((1 + size * 4) * size);
  for (let y = 0; y < size; y++) {
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const i = 1 + x * 4;
      row[i] = r;
      row[i + 1] = g;
      row[i + 2] = b;
      row[i + 3] = a;
    }
    row.copy(raw, y * row.length);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const compressed = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

for (const size of [32, 128, 256]) {
  writeFileSync(join(iconsDir, size === 256 ? "128x128@2x.png" : `${size}x${size}.png`), pngRgba(size, 7, 8, 11));
}

writeFileSync(join(iconsDir, "icon.png"), pngRgba(512, 7, 8, 11));

const png32 = pngRgba(32, 7, 8, 11);
const ico = Buffer.concat([
  Buffer.from([0, 0, 1, 0, 1, 0, 32, 32, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0]),
  Buffer.alloc(4),
  Buffer.from([22, 0, 0, 0]),
  png32
]);
ico.writeUInt32LE(png32.length, 14);
writeFileSync(join(iconsDir, "icon.ico"), ico);

writeFileSync(join(iconsDir, "icon.icns"), pngRgba(128, 7, 8, 11));

console.log("Generated Tauri placeholder icons in src-tauri/icons/");
