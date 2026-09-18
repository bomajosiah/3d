import sharp from 'sharp'
const S = '/private/tmp/claude-501/-Users-bmjsh-Downloads-00-all-3d/2529fcbe-c15e-428b-9183-726f7eef270d/scratchpad/'
async function mask(f) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, C = info.channels, m = new Uint8Array(info.width * info.height)
  for (let i = 0; i < m.length; i++) m[i] = data[i * C + 3] > 128 ? 1 : 0
  return { m, W, H: info.height }
}
const a = await mask('00-tasks/task-1/palette.png'), b = await mask(S + 'mine.png')
const W = a.W, H = a.H, out = Buffer.alloc(W * H * 4)
let diff = 0
for (let i = 0; i < W * H; i++) {
  const r = a.m[i], g = b.m[i]
  if (r !== g) diff++
  const o = i * 4
  out[o] = r ? 255 : 24; out[o + 1] = g ? 255 : 24; out[o + 2] = 48; out[o + 3] = 255
}
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(S + 'overlay.png')
console.log('mismatch px', diff, '=', (100 * diff / (a.m.reduce((s, v) => s + v, 0))).toFixed(2) + '% of reference area')
