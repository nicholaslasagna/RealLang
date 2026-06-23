#!/usr/bin/env node
/**
 * Generate deterministic RealForge app icons from the tracked brand mark source.
 *
 * This stays dependency-free so `npm run check` can refresh icon assets on any
 * machine without remote services or native image libraries.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceSvg = join(root, "assets", "realforge-mark.svg");
const iconsDir = join(root, "src-tauri", "icons");
const assetsDir = join(root, "assets");
mkdirSync(iconsDir, { recursive: true });

if (!existsSync(sourceSvg)) {
  throw new Error("Missing source icon: assets/realforge-mark.svg");
}

const svg = readFileSync(sourceSvg, "utf8");
for (const required of ["RealForge", "anvil", "flame", "ember"]) {
  if (!svg.includes(required)) {
    throw new Error(`Source icon is missing expected brand marker: ${required}`);
  }
}

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

function pngRgba(size, rgba) {
  const raw = Buffer.alloc((1 + size * 4) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dest = row + 1 + x * 4;
      raw[dest] = rgba[src];
      raw[dest + 1] = rgba[src + 1];
      raw[dest + 2] = rgba[src + 2];
      raw[dest + 3] = rgba[src + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function mix(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function colorMix(left, right, t, alpha = 255) {
  return [
    Math.round(mix(left[0], right[0], t)),
    Math.round(mix(left[1], right[1], t)),
    Math.round(mix(left[2], right[2], t)),
    alpha
  ];
}

function put(buffer, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  const a = color[3] / 255;
  const inv = 1 - a;
  buffer[i] = Math.round(color[0] * a + buffer[i] * inv);
  buffer[i + 1] = Math.round(color[1] * a + buffer[i + 1] * inv);
  buffer[i + 2] = Math.round(color[2] * a + buffer[i + 2] * inv);
  buffer[i + 3] = Math.round(255 * a + buffer[i + 3] * inv);
}

function roundedRectMask(x, y, size) {
  const radius = size * 0.205;
  const pad = 0;
  const max = size - 1 - pad;
  const min = pad;
  const cx = x < min + radius ? min + radius : x > max - radius ? max - radius : x;
  const cy = y < min + radius ? min + radius : y > max - radius ? max - radius : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius + 0.5;
}

function pointInPolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const crosses = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function fillPolygon(buffer, size, points, colorAt) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.max(0, Math.floor((Math.min(...xs) / 64) * size) - 1);
  const maxX = Math.min(size - 1, Math.ceil((Math.max(...xs) / 64) * size) + 1);
  const minY = Math.max(0, Math.floor((Math.min(...ys) / 64) * size) - 1);
  const maxY = Math.min(size - 1, Math.ceil((Math.max(...ys) / 64) * size) + 1);
  const scaled = points.map(([x, y]) => [(x / 64) * size, (y / 64) * size]);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, scaled)) put(buffer, size, x, y, colorAt(x / size, y / size));
    }
  }
}

function drawCircle(buffer, size, cx, cy, radius, color) {
  const sx = (cx / 64) * size;
  const sy = (cy / 64) * size;
  const sr = (radius / 64) * size;
  const minX = Math.max(0, Math.floor(sx - sr - 1));
  const maxX = Math.min(size - 1, Math.ceil(sx + sr + 1));
  const minY = Math.max(0, Math.floor(sy - sr - 1));
  const maxY = Math.min(size - 1, Math.ceil(sy + sr + 1));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
      if (d <= sr) {
        const edge = Math.max(0, Math.min(1, sr - d));
        put(buffer, size, x, y, [color[0], color[1], color[2], Math.round(color[3] * Math.min(1, edge + 0.35))]);
      }
    }
  }
}

function drawLine(buffer, size, ax, ay, bx, by, width, color) {
  const x1 = (ax / 64) * size;
  const y1 = (ay / 64) * size;
  const x2 = (bx / 64) * size;
  const y2 = (by / 64) * size;
  const sw = (width / 64) * size;
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - sw - 2));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(x1, x2) + sw + 2));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - sw - 2));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y1, y2) + sw + 2));
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lenSq = vx * vx + vy * vy || 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x1) * vx + (y + 0.5 - y1) * vy) / lenSq));
      const px = x1 + t * vx;
      const py = y1 + t * vy;
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (d <= sw) put(buffer, size, x, y, [color[0], color[1], color[2], Math.round(color[3] * Math.max(0.25, 1 - d / sw))]);
    }
  }
}

function renderIcon(size) {
  const buffer = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!roundedRectMask(x + 0.5, y + 0.5, size)) continue;
      const i = (y * size + x) * 4;
      const v = 7 + Math.round(5 * (y / size));
      buffer[i] = v;
      buffer[i + 1] = v + 1;
      buffer[i + 2] = v + 4;
      buffer[i + 3] = 255;
    }
  }

  const emberCx = (33 / 64) * size;
  const emberCy = (31 / 64) * size;
  const emberR = (28 / 64) * size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - emberCx, y - emberCy) / emberR;
      if (d < 1) {
        const alpha = Math.round(118 * (1 - d) * (1 - d));
        put(buffer, size, x, y, [255, 84, 20, alpha]);
      }
    }
  }

  const flame = [
    [29.5, 33.4],
    [27.3, 28.6],
    [28.2, 23.1],
    [32.3, 17.2],
    [38.7, 12.7],
    [41.9, 8.4],
    [40.8, 15.3],
    [36.4, 22.5],
    [43.1, 17.1],
    [44.4, 24.2],
    [40.9, 30.5],
    [37.4, 33.5],
    [34.3, 28.7]
  ];
  fillPolygon(buffer, size, flame, (_x, y) => colorMix([227, 38, 54], [255, 240, 168], 1 - y, 236));

  const anvilTop = [
    [9.5, 33.5],
    [51.7, 33.5],
    [57.6, 29.8],
    [37.2, 29.8],
    [30, 27.5],
    [22.2, 27.5],
    [19.2, 29.8],
    [7.7, 29.8]
  ];
  const anvilBase = [
    [16.9, 36.3],
    [51.4, 36.3],
    [42.8, 41.1],
    [38.2, 46.8],
    [35.6, 49.9],
    [23.2, 49.9],
    [28.2, 44],
    [19.5, 47.4],
    [22.8, 36.3]
  ];
  const anvilGradient = (x) => (x < 0.52 ? colorMix([143, 17, 28], [227, 38, 54], x / 0.52, 245) : colorMix([227, 38, 54], [255, 159, 36], (x - 0.52) / 0.48, 245));
  fillPolygon(buffer, size, anvilTop, (x) => anvilGradient(x));
  fillPolygon(buffer, size, anvilBase, (x) => anvilGradient(x));

  for (const [ax, ay, bx, by] of [
    [16.9, 36.3, 51.4, 36.3],
    [22.2, 27.5, 30, 27.5],
    [23.2, 49.9, 35.6, 49.9]
  ]) {
    drawLine(buffer, size, ax, ay, bx, by, 0.75, [255, 191, 89, 120]);
  }
  for (const [ax, ay, bx, by] of [
    [31.6, 31.2, 31.6, 24.1],
    [31.6, 24.1, 35.7, 20.7],
    [37.1, 31.7, 37.1, 25.9],
    [37.1, 25.9, 40.2, 23.4],
    [27.4, 30.1, 27.4, 24.9],
    [27.4, 24.9, 24.6, 22.1]
  ]) {
    drawLine(buffer, size, ax, ay, bx, by, 1.15, [255, 231, 174, 205]);
  }
  for (const [cx, cy, radius] of [
    [36.2, 19.9, 2.1],
    [41.3, 22.4, 1.8],
    [24.1, 21.4, 1.8]
  ]) {
    drawCircle(buffer, size, cx, cy, radius + 0.45, [255, 238, 196, 185]);
    drawCircle(buffer, size, cx, cy, radius, [255, 179, 76, 245]);
  }

  return pngRgba(size, buffer);
}

function writePng(name, size, dir = iconsDir) {
  const png = renderIcon(size);
  writeFileSync(join(dir, name), png);
  return png;
}

function writeIco(path, images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  writeFileSync(path, Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]));
}

function writeIcns(path, images) {
  const chunks = images.map(({ type, png }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(8 + chunks.reduce((sum, data) => sum + data.length, 0), 4);
  writeFileSync(path, Buffer.concat([header, ...chunks]));
}

const png16 = renderIcon(16);
const png32 = writePng("32x32.png", 32);
const png48 = renderIcon(48);
const png128 = writePng("128x128.png", 128);
const png256 = writePng("128x128@2x.png", 256);
writePng("256x256.png", 256);
const png512 = writePng("512x512.png", 512);
const png1024 = writePng("1024x1024.png", 1024);
writeFileSync(join(iconsDir, "icon.png"), png512);

writeFileSync(join(assetsDir, "favicon-32x32.png"), png32);
writeFileSync(join(assetsDir, "apple-touch-icon.png"), renderIcon(180));

writeIco(join(iconsDir, "icon.ico"), [
  { size: 16, png: png16 },
  { size: 32, png: png32 },
  { size: 48, png: png48 },
  { size: 256, png: png256 }
]);

writeIcns(join(iconsDir, "icon.icns"), [
  { type: "ic07", png: png128 },
  { type: "ic08", png: png256 },
  { type: "ic09", png: png512 },
  { type: "ic10", png: png1024 }
]);

console.log("Generated RealForge app icons from assets/realforge-mark.svg.");
