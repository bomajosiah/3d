import sharp from 'sharp'
const S = '/private/tmp/claude-501/-Users-bmjsh-Downloads-00-all-3d/2529fcbe-c15e-428b-9183-726f7eef270d/scratchpad/'
async function load(f) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height, C = info.channels, m = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) m[i] = data[i * C + 3] > 128 ? 1 : 0
  return { m, W, H }
}
const CX = 516.5, CY = 527.8, MA = 32.13 * Math.PI / 180
for (const [label, f] of [['ref ', '00-tasks/task-1/palette.png'], ['mine', S + 'mine.png']]) {
  const { m, W, H } = await load(f)
  let area = 0, pmin = 1e9, pmax = -1e9, qmin = 1e9, qmax = -1e9
  let bx0 = 1e9, bx1 = -1, by0 = 1e9, by1 = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) {
    area++
    const dx = x - CX, dy = y - CY
    const p = dx * Math.cos(MA) + dy * Math.sin(MA), q = -dx * Math.sin(MA) + dy * Math.cos(MA)
    if (p < pmin) pmin = p; if (p > pmax) pmax = p
    if (q < qmin) qmin = q; if (q > qmax) qmax = q
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y
  }
  console.log(label, 'area', area, '| major extent', pmin.toFixed(1), pmax.toFixed(1), '=', (pmax - pmin).toFixed(1),
    '| minor extent', qmin.toFixed(1), qmax.toFixed(1), '=', (qmax - qmin).toFixed(1),
    '| bbox', bx0, bx1, by0, by1, '=', bx1 - bx0, 'x', by1 - by0)
}
