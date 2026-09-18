import sharp from 'sharp'
const S = '/private/tmp/claude-501/-Users-bmjsh-Downloads-00-all-3d/2529fcbe-c15e-428b-9183-726f7eef270d/scratchpad/'
async function load(f) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height, C = info.channels, m = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) m[i] = data[i * C + 3] > 128 ? 1 : 0
  return { m, W, H }
}
const CX = 516.5, CY = 527.8
function radial({ m, W, H }) {
  const out = []
  for (let d = 0; d < 360; d += 5) {
    const a = d * Math.PI / 180
    let hit = 0
    for (let r = 600; r > 0; r -= 0.5) {
      const x = Math.round(CX + r * Math.cos(a)), y = Math.round(CY + r * Math.sin(a))
      if (x < 0 || y < 0 || x >= W || y >= H) continue
      if (m[y * W + x]) { hit = r; break }
    }
    out.push([d, hit])
  }
  return out
}
function holeInfo({ m, W, H }) {
  // interior holes: background pixels not reachable from the border
  const seen = new Uint8Array(W * H), q = [0]
  seen[0] = 1
  while (q.length) {
    const i = q.pop(), x = i % W, y = (i / W) | 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const j = ny * W + nx
      if (seen[j] || m[j]) continue
      seen[j] = 1; q.push(j)
    }
  }
  let sx = 0, sy = 0, n = 0, mnx = 1e9, mxx = -1, mny = 1e9, mxy = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x
    if (!m[i] && !seen[i]) { sx += x; sy += y; n++; mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y) }
  }
  return { cx: sx / n, cy: sy / n, n, box: [mnx, mxx, mny, mxy] }
}
const ref = await load('00-tasks/task-1/palette.png'), mine = await load(S + 'mine.png')
const ra = radial(ref), rb = radial(mine)
console.log('angle  ref    mine   diff   (deg measured from centre, 0=right, 90=down)')
let line = ''
for (let i = 0; i < ra.length; i++) {
  const d = rb[i][1] - ra[i][1]
  line += `${String(ra[i][0]).padStart(3)}:${ra[i][1].toFixed(0).padStart(4)}/${rb[i][1].toFixed(0).padStart(4)}=${(d >= 0 ? '+' : '') + d.toFixed(0)}  `
  if ((i + 1) % 6 === 0) { console.log(line); line = '' }
}
if (line) console.log(line)
const ha = holeInfo(ref), hb = holeInfo(mine)
console.log('hole ref  centre', ha.cx.toFixed(1), ha.cy.toFixed(1), 'area', ha.n, 'box', ha.box.join(','))
console.log('hole mine centre', hb.cx.toFixed(1), hb.cy.toFixed(1), 'area', hb.n, 'box', hb.box.join(','))
