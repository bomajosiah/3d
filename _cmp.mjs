import sharp from 'sharp'
const S = '/private/tmp/claude-501/-Users-bmjsh-Downloads-00-all-3d/2529fcbe-c15e-428b-9183-726f7eef270d/scratchpad/'

async function mask(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height, C = info.channels
  const m = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) m[i] = data[i * C + 3] > 128 ? 1 : 0
  return { m, W, H }
}
function stats({ m, W, H }) {
  let sx = 0, sy = 0, n = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { sx += x; sy += y; n++ }
  const cx = sx / n, cy = sy / n
  let xx = 0, yy = 0, xy = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { xx += (x - cx) ** 2; yy += (y - cy) ** 2; xy += (x - cx) * (y - cy) }
  xx /= n; yy /= n; xy /= n
  const t = Math.sqrt((xx - yy) ** 2 + 4 * xy * xy)
  return { cx, cy, n, l1: (xx + yy + t) / 2, l2: (xx + yy - t) / 2, ang: 0.5 * Math.atan2(2 * xy, xx - yy) }
}
const ref = await mask('00-tasks/task-1/palette.png')
const mine = await mask(S + 'mine.png')
const a = stats(ref), b = stats(mine)
console.log('ref ', JSON.stringify({ cx: +a.cx.toFixed(1), cy: +a.cy.toFixed(1), major: +(2 * Math.sqrt(a.l1)).toFixed(1), minor: +(2 * Math.sqrt(a.l2)).toFixed(1), ang: +(a.ang * 180 / Math.PI).toFixed(2), area: a.n }))
console.log('mine', JSON.stringify({ cx: +b.cx.toFixed(1), cy: +b.cy.toFixed(1), major: +(2 * Math.sqrt(b.l1)).toFixed(1), minor: +(2 * Math.sqrt(b.l2)).toFixed(1), ang: +(b.ang * 180 / Math.PI).toFixed(2), area: b.n }))
// align mine onto ref: scale + rotate + translate
const scale = Math.sqrt(a.l1 / b.l1)
const rot = a.ang - b.ang
console.log('align: scale', scale.toFixed(4), 'rotate deg', (rot * 180 / Math.PI).toFixed(2))
const W = 1024, H = 1024
const out = Buffer.alloc(W * H * 4)
const cos = Math.cos(-rot), sin = Math.sin(-rot)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (x - a.cx), dy = (y - a.cy)
  const rx = (dx * cos - dy * sin) / scale + b.cx
  const ry = (dx * sin + dy * cos) / scale + b.cy
  const mi = (rx >= 0 && ry >= 0 && rx < W && ry < H) ? mine.m[(ry | 0) * W + (rx | 0)] : 0
  const ri = ref.m[y * W + x]
  const i = (y * W + x) * 4
  out[i] = ri ? 255 : 30; out[i + 1] = mi ? 255 : 30; out[i + 2] = 40; out[i + 3] = 255
}
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(S + 'overlay.png')
console.log('overlay written  (red=reference only, green=mine only, yellow=both)')
