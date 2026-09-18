import sharp from 'sharp'
const D = Math.PI / 180
const P = JSON.parse(process.argv[2])
function sdEllipse(x, z, a, b) { const k1 = Math.hypot(x / a, z / b); if (k1 < 1e-9) return -Math.min(a, b); const k2 = Math.hypot(x / (a * a), z / (b * b)); return (k1 - 1) * k1 / k2 }
function wedge(P) { const f = P.flare * D, aim = [Math.cos(P.aim * D), Math.sin(P.aim * D)], near = P.nose / Math.sin(f)
  const a = [P.apexX + aim[0] * near, P.apexZ + aim[1] * near]; return { a, b: [a[0] + aim[0] * P.reach, a[1] + aim[1] * P.reach], r1: P.nose, r2: P.nose + P.reach * Math.sin(f) } }
function sdCone(x, z, W) { const bx = W.b[0] - W.a[0], bz = W.b[1] - W.a[1], px = x - W.a[0], pz = z - W.a[1]
  const span = bx * bx + bz * bz, drop = W.r1 - W.r2, reach = span - drop * drop
  const y = px * bx + pz * bz, zz = y - span, c0 = px * span - bx * y, c1 = pz * span - bz * y
  const x2 = c0 * c0 + c1 * c1, y2 = y * y * span, z2 = zz * zz * span, k = Math.sign(drop) * drop * drop * x2
  if (Math.sign(zz) * reach * z2 > k) return Math.sqrt(x2 + z2) / span - W.r2
  if (Math.sign(y) * reach * y2 < k) return Math.sqrt(x2 + y2) / span - W.r1
  return (Math.sqrt(x2 * reach / span) + y * drop) / span - W.r1 }
function smax(a, b, k) { const h = Math.max(0, Math.min(1, 0.5 - 0.5 * (b - a) / k)); return b * (1 - h) + a * h + k * h * (1 - h) }
const W = wedge(P)
const ct = Math.cos(P.spin * D), st = Math.sin(P.spin * D), ca = Math.cos(P.tilt * D), sa = Math.sin(P.tilt * D)
const hc = Math.cos(P.holeTilt * D), hs = Math.sin(P.holeTilt * D)
const N = 1024, out = Buffer.alloc(N * N * 4)
const { data, info } = await sharp('00-tasks/task-1/palette.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const ys = [-0.5, -0.375, -0.25, -0.125, 0, 0.125, 0.25, 0.375, 0.5].map(t => t * P.thick)
let bad = 0, area = 0
for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
  let solid = false, holeAll = true
  for (const y of ys) {
    const u = (px - P.cx) / P.k, v = -(py - P.cy) / P.k, w = (v - y * ca) / sa
    const lx = u * ct + w * st, lz = u * st - w * ct
    if (smax(sdEllipse(lx, lz, 1, P.waist), -sdCone(lx, lz, W), P.join) < 0) solid = true
    const dx = lx - P.holeX, dz = lz - P.holeZ
    if (sdEllipse(dx * hc + dz * hs, -dx * hs + dz * hc, P.holeRX, P.holeRZ) >= 0) holeAll = false
  }
  const mine = (solid && !holeAll) ? 1 : 0
  const ref = data[(py * info.width + px) * info.channels + 3] > 128 ? 1 : 0
  if (ref) area++
  if (ref !== mine) bad++
  const o = (py * N + px) * 4
  out[o] = ref ? 255 : 24; out[o + 1] = mine ? 255 : 24; out[o + 2] = 48; out[o + 3] = 255
}
await sharp(out, { raw: { width: N, height: N, channels: 4 } }).png().toFile('/private/tmp/claude-501/-Users-bmjsh-Downloads-00-all-3d/2529fcbe-c15e-428b-9183-726f7eef270d/scratchpad/fit.png')
console.log('mismatch', bad, '=', (100 * bad / area).toFixed(2) + '% of reference area')
