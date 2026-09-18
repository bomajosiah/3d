export const D = Math.PI / 180
export function sdSuper(x, z, a, b, n) {
  const ax = Math.abs(x / a), az = Math.abs(z / b)
  if (ax < 1e-9 && az < 1e-9) return -Math.min(a, b)
  const p = Math.pow(ax, n) + Math.pow(az, n)
  const f = Math.pow(p, 1 / n) - 1
  const s = Math.pow(p, 1 / n - 1)
  const gx = s * Math.pow(ax, n - 1) * Math.sign(x) / a
  const gz = s * Math.pow(az, n - 1) * Math.sign(z) / b
  const g = Math.hypot(gx, gz)
  return g > 1e-12 ? f / g : f
}
export function wedge(P) {
  const f = P.flare * D, aim = [Math.cos(P.aim * D), Math.sin(P.aim * D)], near = P.nose / Math.sin(f)
  const a = [P.apexX + aim[0] * near, P.apexZ + aim[1] * near]
  return { a, b: [a[0] + aim[0] * P.reach, a[1] + aim[1] * P.reach], r1: P.nose, r2: P.nose + P.reach * Math.sin(f) }
}
export function sdCone(x, z, W) {
  const bx = W.b[0] - W.a[0], bz = W.b[1] - W.a[1], px = x - W.a[0], pz = z - W.a[1]
  const span = bx * bx + bz * bz, drop = W.r1 - W.r2, reach = span - drop * drop
  const y = px * bx + pz * bz, zz = y - span, c0 = px * span - bx * y, c1 = pz * span - bz * y
  const x2 = c0 * c0 + c1 * c1, y2 = y * y * span, z2 = zz * zz * span, k = Math.sign(drop) * drop * drop * x2
  if (Math.sign(zz) * reach * z2 > k) return Math.sqrt(x2 + z2) / span - W.r2
  if (Math.sign(y) * reach * y2 < k) return Math.sqrt(x2 + y2) / span - W.r1
  return (Math.sqrt(x2 * reach / span) + y * drop) / span - W.r1
}
export function smax(a, b, k) { const h = Math.max(0, Math.min(1, 0.5 - 0.5 * (b - a) / k)); return b * (1 - h) + a * h + k * h * (1 - h) }
export function coverage(P, W, px, py, ys, trig) {
  const { ct, st, ca, sa, hc, hs } = trig
  let solid = false, holeAll = true
  for (const y of ys) {
    const u = (px - P.cx) / P.k, v = -(py - P.cy) / P.k, w = (v - y * ca) / sa
    const lx = u * ct + w * st, lz = u * st - w * ct
    if (smax(sdSuper(lx, lz, 1, P.waist, P.power), -sdCone(lx, lz, W), P.join) < 0) solid = true
    const dx = lx - P.holeX, dz = lz - P.holeZ
    if (sdSuper(dx * hc + dz * hs, -dx * hs + dz * hc, P.holeRX, P.holeRZ, 2) >= 0) holeAll = false
  }
  return (solid && !holeAll) ? 1 : 0
}
export function trigOf(P) {
  return { ct: Math.cos(P.spin * D), st: Math.sin(P.spin * D), ca: Math.cos(P.tilt * D), sa: Math.sin(P.tilt * D),
    hc: Math.cos(P.holeTilt * D), hs: Math.sin(P.holeTilt * D) }
}
