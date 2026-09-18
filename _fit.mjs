import sharp from 'sharp'
function fit(pts) {
  const n = pts.length, sxm = pts.reduce((s, p) => s + p[0], 0) / n, sym = pts.reduce((s, p) => s + p[1], 0) / n, sc = 400
  const M = [], rhs = []
  for (const [X, Y] of pts) { const x = (X - sxm) / sc, y = (Y - sym) / sc; M.push([x * x, x * y, y * y, x, y]); rhs.push(1) }
  const N = 5, AtA = Array.from({ length: N }, () => new Array(N).fill(0)), Atb = new Array(N).fill(0)
  for (let k = 0; k < n; k++) for (let i = 0; i < N; i++) { Atb[i] += M[k][i] * rhs[k]; for (let j = 0; j < N; j++) AtA[i][j] += M[k][i] * M[k][j] }
  for (let i = 0; i < N; i++) {
    let p = i; for (let r = i + 1; r < N; r++) if (Math.abs(AtA[r][i]) > Math.abs(AtA[p][i])) p = r
    ;[AtA[i], AtA[p]] = [AtA[p], AtA[i]];[Atb[i], Atb[p]] = [Atb[p], Atb[i]]
    for (let r = 0; r < N; r++) { if (r === i) continue; const f = AtA[r][i] / AtA[i][i]; for (let c = i; c < N; c++) AtA[r][c] -= f * AtA[i][c]; Atb[r] -= f * Atb[i] }
  }
  const [a, b, c, d, e] = Atb.map((v, i) => v / AtA[i][i]), F = -1
  const den = b * b - 4 * a * c, cx = (2 * c * d - b * e) / den, cy = (2 * a * e - b * d) / den
  const t1 = 2 * (a * e * e + c * d * d + F * b * b - b * d * e - 4 * a * c * F), s = Math.sqrt((a - c) ** 2 + b * b)
  const A = Math.abs(Math.sqrt(t1 * (a + c + s)) / den) * sc, B = Math.abs(Math.sqrt(t1 * (a + c - s)) / den) * sc
  return { cx: cx * sc + sxm, cy: cy * sc + sym, A, B, ratio: A / B, ang: 0.5 * Math.atan2(b, a - c) * 180 / Math.PI }
}
async function boundary(file, dropNotch) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height, C = info.channels
  const A = (x, y) => data[(y * W + x) * C + 3] > 128
  const pts = []
  let x0 = W, x1 = 0
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (A(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); break }
  const span = x1 - x0
  for (let x = x0; x <= x1; x++) {
    let t = -1, b = -1
    for (let y = 0; y < H; y++) if (A(x, y)) { t = y; break }
    for (let y = H - 1; y >= 0; y--) if (A(x, y)) { b = y; break }
    if (t < 0) continue
    const u = (x - x0) / span
    if (u > 0.045 && u < 0.955) {
      pts.push([x, t])
      if (!(u > dropNotch[0] && u < dropNotch[1])) pts.push([x, b])
    }
  }
  return { pts, x0, x1, W, H }
}
const S = '/private/tmp/claude-501/-Users-bmjsh-Downloads-00-all-3d/2529fcbe-c15e-428b-9183-726f7eef270d/scratchpad/'
for (const [label, file] of [['ref ', '00-tasks/task-1/palette.png'], ['mine', S + 'mine.png']]) {
  const { pts, x0, x1 } = await boundary(file, [0.52, 0.90])
  const f = fit(pts)
  const major = f.A > f.B ? f.A : f.B, minor = f.A > f.B ? f.B : f.A
  const ang = f.A > f.B ? f.ang : f.ang + 90
  console.log(label, 'centre', f.cx.toFixed(1), f.cy.toFixed(1), '| semi', major.toFixed(1), minor.toFixed(1),
    '| ratio', (major / minor).toFixed(3), '| major-angle(y-down)', (((ang % 180) + 180) % 180).toFixed(2),
    '| width px', x1 - x0)
}
