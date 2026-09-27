#!/usr/bin/env node
/**
 * توليد أيقونة التطبيق (build/icon.ico) بدون أي مكتبة خارجية.
 *
 * الرسم يتم رقمياً: مستطيل بحواف دائرية بلون العلامة (brand) + كتاب مفتوح
 * أبيض + فاصل كتب أخضر/ذهبي، مع تنعيم (supersampling) 4× لكل نقطة.
 * ثم يُرمَّز الناتج كملف ICO بترميز BMP 32bpp (متوافق مع rcedit / electron-builder).
 *
 *   node scripts/make-icon.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'build')

/* ----------------------------- لوحة الرسم ----------------------------- */
const SIZE = 256
const SS = 4 // نسبة التنعيم
const BRAND_TOP = [0x3b, 0x68, 0xab]
const BRAND_BOTTOM = [0x1b, 0x2e, 0x4e]
const PAGE = [0xff, 0xff, 0xff]
const PAGE_SHADE = [0xe4, 0xec, 0xf7]
const SPINE = [0x1f, 0x36, 0x5d]
const LINE = [0xb3, 0xcd, 0xeb]
const RIBBON = [0xe2, 0xa1, 0x3c]

const canvas = new Uint8ClampedArray(SIZE * SIZE * 4)

function insideRoundedRect(radius) {
  return (x, y) => {
    const r = radius
    if (x < r || x > 1 - r) {
      if (y < r || y > 1 - r) {
        const cx = x < r ? r : 1 - r
        const cy = y < r ? r : 1 - r
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
      }
    }
    return true
  }
}

/** اختبار نقطة داخل مضلّع (even-odd) */
function insidePolygon(points) {
  return (x, y) => {
    let inside = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i]
      const [xj, yj] = points[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }
}

/* شكل الكتاب المفتوح: إحداثيات مبنية على (t, v)
   t = 0 عند الكعب (المنتصف) و t = 1 عند الحافة الخارجية
   v = 0 أعلى الصفحة و v = 1 أسفلها */
function pagePoint(side, t, v) {
  const spread = 0.335
  const x = 0.5 + side * t * spread
  const top = 0.318 + 0.062 * t + 0.032 * t * t
  const height = 0.335 - 0.018 * t
  return [x, top + height * v]
}

function pagePolygon(side) {
  const points = []
  const steps = 18
  for (let i = 0; i <= steps; i++) points.push(pagePoint(side, i / steps, 0))
  for (let i = steps; i >= 0; i--) points.push(pagePoint(side, i / steps, 1))
  return points
}

/** شريط كتابة على الصفحة بين t0 و t1 عند الارتفاع v بسماكة dv */
function linePolygon(side, t0, t1, v, dv) {
  const points = [
    pagePoint(side, t0, v - dv / 2),
    pagePoint(side, t1, v - dv / 2),
    pagePoint(side, t1, v + dv / 2),
    pagePoint(side, t0, v + dv / 2)
  ]
  return points
}

/* ------------------------------- الرسم -------------------------------- */
const gradient = (x, y) => {
  const k = Math.min(1, Math.max(0, (y - 0.06) / 0.88))
  return [
    BRAND_TOP[0] + (BRAND_BOTTOM[0] - BRAND_TOP[0]) * k,
    BRAND_TOP[1] + (BRAND_BOTTOM[1] - BRAND_TOP[1]) * k,
    BRAND_TOP[2] + (BRAND_BOTTOM[2] - BRAND_TOP[2]) * k
  ]
}

const shapes = [
  // خلفية دائرية الحواف بتدرّج لوني
  { inside: insideRoundedRect(0.2), color: gradient },
  // الصفحة اليسرى
  { inside: insidePolygon(pagePolygon(-1)), color: PAGE },
  // الصفحة اليمنى
  { inside: insidePolygon(pagePolygon(1)), color: PAGE },
  // ظل خفيف أسفل الصفحات
  {
    inside: (x, y) => insidePolygon(pagePolygon(-1))(x, y) && y > 0.6,
    color: PAGE_SHADE
  },
  {
    inside: (x, y) => insidePolygon(pagePolygon(1))(x, y) && y > 0.6,
    color: PAGE_SHADE
  },
  // كعب الكتاب
  { inside: insidePolygon([pagePoint(-1, 0, 0), pagePoint(1, 0, 0), pagePoint(1, 0, 1), pagePoint(-1, 0, 1)]), color: SPINE }
]

// أسطر الكتابة
const lineRuns = [
  { t0: 0.1, t1: 0.82, v: 0.2 },
  { t0: 0.1, t1: 0.72, v: 0.4 },
  { t0: 0.1, t1: 0.82, v: 0.6 },
  { t0: 0.1, t1: 0.52, v: 0.8 }
]

for (const side of [-1, 1]) {
  for (const run of lineRuns) {
    shapes.push({ inside: insidePolygon(linePolygon(side, run.t0, run.t1, run.v, 0.052)), color: LINE })
  }
}

// شريط العلام (ribbon) أسفل الكعب
const ribbonWidth = 0.052
shapes.push({
  inside: insidePolygon([
    [0.5 - ribbonWidth, 0.62],
    [0.5 + ribbonWidth, 0.62],
    [0.5 + ribbonWidth, 0.78],
    [0.5, 0.72],
    [0.5 - ribbonWidth, 0.78]
  ]),
  color: RIBBON
})

const step = 1 / SS
const offset = step / 2
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0
    let g = 0
    let b = 0
    let covered = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const u = (x + step * sx + offset) / SIZE
        const v = (y + step * sy + offset) / SIZE
        // أعلى شكل يحتوي النقطة هو الظاهر
        let color = null
        for (const shape of shapes) {
          if (!shape.inside(u, v)) continue
          color = typeof shape.color === 'function' ? shape.color(u, v) : shape.color
        }
        if (!color) continue
        covered++
        const alpha = 1
        r += color[0] * alpha
        g += color[1] * alpha
        b += color[2] * alpha
      }
    }
    const total = SS * SS
    const index = (y * SIZE + x) * 4
    canvas[index] = r / total
    canvas[index + 1] = g / total
    canvas[index + 2] = b / total
    canvas[index + 3] = (covered / total) * 255
  }
}

/* --------------------------- تصغير (box filter) ------------------------ */
function resize(source, size) {
  const out = new Uint8ClampedArray(size * size * 4)
  const scale = SIZE / size
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let count = 0
      const x0 = Math.floor(x * scale)
      const y0 = Math.floor(y * scale)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale))
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale))
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const index = (sy * SIZE + sx) * 4
          r += source[index]
          g += source[index + 1]
          b += source[index + 2]
          a += source[index + 3]
          count++
        }
      }
      const index = (y * size + x) * 4
      out[index] = r / count
      out[index + 1] = g / count
      out[index + 2] = b / count
      out[index + 3] = a / count
    }
  }
  return out
}

/* ------------------------------ PNG encoder --------------------------- */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

function toPng(rgba, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // فلتر بلا تحويل
    for (let x = 0; x < size * 4; x++) raw[y * (size * 4 + 1) + 1 + x] = rgba[y * size * 4 + x]
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.writeUInt8(8, 8)
  header.writeUInt8(6, 9)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ------------------------------ ICO encoder --------------------------- */
function toDib(rgba, size) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8) // XOR + AND
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16)
  header.writeUInt32LE(size * size * 4, 20)

  const xor = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    const sourceRow = size - 1 - y // BMP من الأسفل إلى الأعلى
    for (let x = 0; x < size; x++) {
      const source = (sourceRow * size + x) * 4
      const target = (y * size + x) * 4
      const alpha = rgba[source + 3] / 255
      xor[target] = rgba[source + 2] * alpha
      xor[target + 1] = rgba[source + 1] * alpha
      xor[target + 2] = rgba[source] * alpha
      xor[target + 3] = rgba[source + 3]
    }
  }

  const maskRow = Math.ceil(size / 32) * 4
  const and = Buffer.alloc(maskRow * size)
  for (let y = 0; y < size; y++) {
    const sourceRow = size - 1 - y
    for (let x = 0; x < size; x++) {
      if (rgba[(sourceRow * size + x) * 4 + 3] > 8) continue
      and[y * maskRow + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }

  return Buffer.concat([header, xor, and])
}

const sizes = [256, 128, 64, 48, 32, 16]
const images = sizes.map((size) => ({ size, data: toDib(size === SIZE ? canvas : resize(canvas, size), size) }))

const directory = Buffer.alloc(6)
directory.writeUInt16LE(0, 0)
directory.writeUInt16LE(1, 2)
directory.writeUInt16LE(images.length, 4)

let imageOffset = 6 + images.length * 16
const entries = []
for (const image of images) {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(image.size >= 256 ? 0 : image.size, 0)
  entry.writeUInt8(image.size >= 256 ? 0 : image.size, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(image.data.length, 8)
  entry.writeUInt32LE(imageOffset, 12)
  imageOffset += image.data.length
  entries.push(entry)
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'icon.ico'), Buffer.concat([directory, ...entries, ...images.map((image) => image.data)]))
writeFileSync(join(outDir, 'icon.png'), toPng(canvas, SIZE))
console.log(`[make-icon] تم إنشاء ${join('build', 'icon.ico')} و icon.png (${sizes.join(', ')} بكسل)`)
