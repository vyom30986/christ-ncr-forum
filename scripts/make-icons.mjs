// Generates public/icons/icon-192.png, icon-512.png, icon-maskable-512.png.
// Pure Node (zlib only): a yellow tile with the CU C/S tetris stack on it.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(out, { recursive: true })

const INK = [10, 10, 10], YELLOW = [245, 184, 46]
const SW = { Y: [10, 10, 10], G: [46, 204, 113], P: [255, 95, 162], B: [61, 123, 255], V: [139, 92, 246] }
// 8x8 stack (same spirit as the login screen)
const STACK = ['........', '......Y.', '.....YYY', 'B.......', 'BBB..PP.', 'GG.V.PP.', '.GGVVVBB', 'PPGGYYBV']

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y)
      const o = y * (size * 3 + 1) + 1 + x * 3
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

function draw(size, { maskable }) {
  // Maskable icons keep everything inside the central 80% safe zone.
  const pad = maskable ? size * 0.14 : size * 0.08
  const inner = size - pad * 2
  const cell = inner / 8
  const gap = cell * 0.12
  const radius = maskable ? 0 : size * 0.18
  return png(size, (x, y) => {
    // rounded tile corners (transparent isn't available in RGB; use ink)
    if (!maskable) {
      const cx = x < radius ? radius : x >= size - radius ? size - radius - 1 : x
      const cy = y < radius ? radius : y >= size - radius ? size - radius - 1 : y
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) return INK
    }
    const gx = Math.floor((x - pad) / cell), gy = Math.floor((y - pad) / cell)
    if (gx >= 0 && gx < 8 && gy >= 0 && gy < 8) {
      const ch = STACK[gy][gx]
      const lx = x - pad - gx * cell, ly = y - pad - gy * cell
      const insideCell = lx >= gap && lx < cell - gap && ly >= gap && ly < cell - gap
      if (ch !== '.' && insideCell) {
        const col = SW[ch]
        // inner shadow on bottom-right like the design's blocks
        const shade = lx > cell - gap - cell * 0.18 || ly > cell - gap - cell * 0.18
        return shade ? col.map((v) => Math.round(v * 0.82)) : col
      }
    }
    return YELLOW
  })
}

writeFileSync(join(out, 'icon-192.png'), draw(192, { maskable: false }))
writeFileSync(join(out, 'icon-512.png'), draw(512, { maskable: false }))
writeFileSync(join(out, 'icon-maskable-512.png'), draw(512, { maskable: true }))
console.log('icons written to', out)
