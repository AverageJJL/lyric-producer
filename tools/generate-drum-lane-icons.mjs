/**
 * Generates monochrome 24x24 lane icons for the step sequencer.
 * Run: node tools/generate-drum-lane-icons.mjs
 */
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, '..', 'assets', 'drums', 'icons');
const SIZE = 24;

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  const crcInput = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(filePath, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = 1 + SIZE * 4;
  const raw = Buffer.alloc(rowBytes * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * rowBytes] = 0;
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;
      const o = y * rowBytes + 1 + x * 4;
      raw[o] = pixels[i];
      raw[o + 1] = pixels[i + 1];
      raw[o + 2] = pixels[i + 2];
      raw[o + 3] = pixels[i + 3];
    }
  }

  const compressed = zlib.deflateSync(raw);
  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(filePath, png);
}

function blank() {
  return new Uint8Array(SIZE * SIZE * 4);
}

function setPixel(px, x, y, r, g, b, a = 220) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
    return;
  }
  const i = (y * SIZE + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

function fillCircle(px, cx, cy, radius) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(px, x, y, 200, 206, 216);
      }
    }
  }
}

function fillRect(px, x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      setPixel(px, x, y, 200, 206, 216);
    }
  }
}

function drawKick(px) {
  fillCircle(px, 12, 14, 8);
  fillRect(px, 10, 4, 4, 6);
}

function drawSnare(px) {
  fillCircle(px, 12, 12, 7);
  for (let i = 0; i < 8; i += 1) {
    setPixel(px, 4 + i * 2, 6, 200, 206, 216);
    setPixel(px, 4 + i * 2, 18, 200, 206, 216);
  }
}

function drawHatClosed(px) {
  fillRect(px, 6, 14, 12, 2);
  fillRect(px, 8, 10, 8, 3);
  fillRect(px, 11, 6, 2, 5);
}

function drawHatOpen(px) {
  fillRect(px, 4, 16, 16, 2);
  fillRect(px, 6, 12, 12, 2);
  fillRect(px, 11, 5, 2, 8);
}

function drawTom(px, small) {
  const r = small ? 5 : 6;
  fillCircle(px, 12, 13, r);
  fillRect(px, 10, 5, 4, 5);
}

function drawPerc(px) {
  fillCircle(px, 8, 14, 3);
  fillCircle(px, 16, 14, 3);
  fillRect(px, 10, 8, 4, 8);
}

function drawClap(px) {
  fillRect(px, 5, 8, 4, 10);
  fillRect(px, 15, 8, 4, 10);
  fillRect(px, 9, 10, 6, 6);
}

const icons = {
  kick: drawKick,
  snare: drawSnare,
  hatClosed: drawHatClosed,
  hatOpen: drawHatOpen,
  tom1: px => drawTom(px, false),
  tom2: px => drawTom(px, true),
  perc: drawPerc,
  clap: drawClap,
};

mkdirSync(outputDir, {recursive: true});
Object.entries(icons).forEach(([name, draw]) => {
  const px = blank();
  draw(px);
  writePng(join(outputDir, `${name}.png`), px);
  console.log(`Wrote ${name}.png`);
});
