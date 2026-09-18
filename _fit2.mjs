import sharp from 'sharp'
import { wedge, coverage, trigOf } from './_shape.mjs'
const { data, info } = await sharp('00-tasks/task-1/palette.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const RW = info.width, RC = info.channels
const SIZE = 384, X0 = 40, Y0 = 130, X1 = 1000, Y1 = 900
const sx = (X1 - X0) / SIZE, sy = (Y1 - Y0) / SIZE
const target = new Float32Array(SIZE * SIZE)
for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
  let acc = 0
  for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
    const px = Math.round(X0 + (i + 0.25 + a * 0.5) * sx), py = Math.round(Y0 + (j + 0.25 + b * 0.5) * sy)
    acc += (px >= 0 && py >= 0 && px < RW && py < info.height) ? data[(py * RW + px) * RC + 3] / 255 : 0
  }
  target[j * SIZE + i] = acc / 4
}
function cost(P) {
  if (P.waist <= 0.3 || P.waist > 1 || P.thick <= 0.02 || P.thick > 0.4) return 1e9
  if (P.flare <= 3 || P.flare > 70 || P.nose <= 0.006 || P.join <= 0.01 || P.join > 0.35) return 1e9
  if (P.holeRX <= 0.02 || P.holeRZ <= 0.02 || P.power < 1.7 || P.power > 3.2) return 1e9
  const W = wedge(P), trig = trigOf(P)
  const ys = [-0.5, -0.25, 0, 0.25, 0.5].map(t => t * P.thick)
  let err = 0
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    let acc = 0
    for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++)
      acc += coverage(P, W, X0 + (i + 0.25 + a * 0.5) * sx, Y0 + (j + 0.25 + b * 0.5) * sy, ys, trig)
    const d = acc / 4 - target[j * SIZE + i]
    err += d * d
  }
  return err
}
let P = { tilt: 56, spin: -41.153, waist: 0.6639, power: 2.0, thick: 0.1468, k: 480.7, cx: 518.91, cy: 529.69,
  apexX: 0.344, apexZ: 0.164, aim: 14.74, flare: 24.425, nose: 0.02, reach: 1.3, join: 0.2139,
  holeX: 0.2611, holeZ: -0.1124, holeRX: 0.1795, holeRZ: 0.1097, holeTilt: 14.61 }
const KEYS = ['spin', 'waist', 'power', 'thick', 'k', 'cx', 'cy', 'apexX', 'apexZ', 'aim', 'flare', 'nose', 'reach', 'join', 'holeX', 'holeZ', 'holeRX', 'holeRZ', 'holeTilt']
const STEP = { spin: 1.2, waist: 0.02, power: 0.08, thick: 0.015, k: 5, cx: 5, cy: 5, apexX: 0.03, apexZ: 0.03, aim: 3, flare: 3, nose: 0.015, reach: 0.15, join: 0.03, holeX: 0.02, holeZ: 0.02, holeRX: 0.015, holeRZ: 0.015, holeTilt: 6 }
let best = cost(P)
console.log('start', best.toFixed(1))
for (let pass = 0; pass < 20; pass++) {
  for (const key of KEYS) for (const dir of [1, -1]) {
    let s = STEP[key] * dir
    for (let t = 0; t < 8; t++) {
      const Q = { ...P, [key]: P[key] + s }
      const c = cost(Q)
      if (c < best - 1e-6) { best = c; P = Q } else break
    }
  }
  for (const key of KEYS) STEP[key] *= 0.72
  if (pass % 4 === 3) console.log('pass', pass, best.toFixed(1))
}
console.log(JSON.stringify(P, (k, v) => typeof v === 'number' ? +v.toFixed(5) : v))
