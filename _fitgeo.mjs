import sharp from 'sharp'
const D = Math.PI / 180

// ---- shape (mirrors assets/builders/palette.py) ----
function sdEllipse(x, z, a, b) {
  const k1 = Math.hypot(x / a, z / b)
  if (k1 < 1e-9) return -Math.min(a, b)
  const k2 = Math.hypot(x / (a * a), z / (b * b))
  return (k1 - 1) * k1 / k2
}
function wedge(P) {
  const flare = P.flare * D, aim = [Math.cos(P.aim * D), Math.sin(P.aim * D)]
  const near = P.nose / Math.sin(flare)
  const a = [P.apexX + aim[0] * near, P.apexZ + aim[1] * near]
  const b = [a[0] + aim[0] * P.reach, a[1] + aim[1] * P.reach]
  return { a, b, r1: P.nose, r2: P.nose + P.reach * Math.sin(flare) }
}
function sdCone(x, z, W) {
  const bx = W.b[0] - W.a[0], bz = W.b[1] - W.a[1]
  const px = x - W.a[0], pz = z - W.a[1]
  const span = bx * bx + bz * bz, drop = W.r1 - W.r2, reach = span - drop * drop
  const y = px * bx + pz * bz, zz = y - span
  const c0 = px * span - bx * y, c1 = pz * span - bz * y
  const x2 = c0 * c0 + c1 * c1, y2 = y * y * span, z2 = zz * zz * span
  const k = Math.sign(drop) * drop * drop * x2
  if (Math.sign(zz) * reach * z2 > k) return Math.sqrt(x2 + z2) / span - W.r2
  if (Math.sign(y) * reach * y2 < k) return Math.sqrt(x2 + y2) / span - W.r1
  return (Math.sqrt(x2 * reach / span) + y * drop) / span - W.r1
}
function smax(a, b, k) {
  const h = Math.max(0, Math.min(1, 0.5 - 0.5 * (b - a) / k))
  return b * (1 - h) + a * h + k * h * (1 - h)
}
function sdBoard(x, z, P, W) { return smax(sdEllipse(x, z, 1, P.waist), -sdCone(x, z, W), P.join) }
function sdHole(x, z, P) {
  const c = Math.cos(P.holeTilt * D), s = Math.sin(P.holeTilt * D)
  const dx = x - P.holeX, dz = z - P.holeZ
  return sdEllipse(dx * c + dz * s, -dx * s + dz * c, P.holeRX, P.holeRZ)
}

// ---- forward projection: local (x,z) on plane y -> image px ----
function projector(P) {
  const ct = Math.cos(P.spin * D), st = Math.sin(P.spin * D)
  const ca = Math.cos(P.tilt * D), sa = Math.sin(P.tilt * D)
  // inverse: image px + plane y -> local (x,z)
  return (px, py, y) => {
    const u = (px - P.cx) / P.k, v = -(py - P.cy) / P.k
    const w = (v - y * ca) / sa            // = x sin(spin) - z cos(spin)
    return [u * ct + w * st, u * st - w * ct]
  }
}
function rasterise(P, W, size, box) {
  const [x0, y0, x1, y1] = box, wide = x1 - x0, tall = y1 - y0
  const m = new Uint8Array(size * size)
  const back = projector(P)
  const ys = [-0.5, -0.25, 0, 0.25, 0.5].map(t => t * P.thick)
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const px = x0 + (i + 0.5) * wide / size, py = y0 + (j + 0.5) * tall / size
    let solid = false, holeAll = true
    for (const y of ys) {
      const [lx, lz] = back(px, py, y)
      const inBoard = sdBoard(lx, lz, P, W) < 0
      if (inBoard) solid = true
      if (sdHole(lx, lz, P) >= 0) holeAll = false
    }
    m[j * size + i] = (solid && !holeAll) ? 1 : 0
  }
  return m
}

// ---- reference mask, downsampled to the same grid ----
const REF = await (async () => {
  const { data, info } = await sharp('00-tasks/task-1/palette.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, W: info.width, H: info.height, C: info.channels }
})()
function refMask(size, box) {
  const [x0, y0, x1, y1] = box, wide = x1 - x0, tall = y1 - y0
  const m = new Uint8Array(size * size)
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const px = Math.round(x0 + (i + 0.5) * wide / size), py = Math.round(y0 + (j + 0.5) * tall / size)
    if (px >= 0 && py >= 0 && px < REF.W && py < REF.H) m[j * size + i] = REF.data[(py * REF.W + px) * REF.C + 3] > 128 ? 1 : 0
  }
  return m
}

const BOX = [40, 130, 1000, 900]
const SIZE = 320
const TARGET = refMask(SIZE, BOX)

function cost(P) {
  if (P.waist <= 0.3 || P.waist > 1 || P.thick <= 0.02 || P.thick > 0.5) return 1e9
  if (P.flare <= 3 || P.flare > 70 || P.nose <= 0.004 || P.join <= 0.005) return 1e9
  if (P.holeRX <= 0.02 || P.holeRZ <= 0.02) return 1e9
  const W = wedge(P)
  const m = rasterise(P, W, SIZE, BOX)
  let bad = 0
  for (let i = 0; i < m.length; i++) if (m[i] !== TARGET[i]) bad++
  return bad
}

const KEYS = ['spin', 'waist', 'thick', 'k', 'cx', 'cy', 'apexX', 'apexZ', 'aim', 'flare', 'nose', 'reach', 'join', 'holeX', 'holeZ', 'holeRX', 'holeRZ', 'holeTilt']
let P = {
  tilt: 56, spin: -43.92, waist: 0.682, thick: 0.157, k: 483.7, cx: 516.4, cy: 527.4,
  apexX: 0.340, apexZ: 0.164, aim: 11.5, flare: 26.3, nose: 0.030, reach: 1.30, join: 0.060,
  holeX: 0.265, holeZ: -0.141, holeRX: 0.181, holeRZ: 0.166, holeTilt: 35,
}
const STEP = { spin: 0.6, waist: 0.01, thick: 0.01, k: 3, cx: 3, cy: 3, apexX: 0.02, apexZ: 0.02, aim: 2, flare: 2, nose: 0.01, reach: 0.08, join: 0.015, holeX: 0.012, holeZ: 0.012, holeRX: 0.008, holeRZ: 0.008, holeTilt: 4 }

let best = cost(P)
console.log('start cost', best)
for (let pass = 0; pass < 14; pass++) {
  let improved = false
  for (const key of KEYS) {
    for (const dir of [1, -1]) {
      let s = STEP[key] * dir
      for (let tries = 0; tries < 6; tries++) {
        const Q = { ...P, [key]: P[key] + s }
        const c = cost(Q)
        if (c < best) { best = c; P = Q; improved = true } else break
      }
    }
  }
  for (const key of KEYS) STEP[key] *= 0.62
  console.log('pass', pass, 'cost', best)
  if (!improved && pass > 4) break
}
console.log(JSON.stringify(P, (k, v) => typeof v === 'number' ? +v.toFixed(5) : v, 1))
console.log('mismatch fraction', (best / (SIZE * SIZE)).toFixed(4))
