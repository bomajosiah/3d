import sharp from 'sharp'
const S = process.env.SP + '/'
const W = 1024, H = 1024
let g = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
for (let x = 0; x <= W; x += 64) g += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#00d0ff" stroke-width="1" opacity="0.5"/>`
for (let y = 0; y <= H; y += 64) g += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#00d0ff" stroke-width="1" opacity="0.5"/>`
for (let x = 0; x <= W; x += 128) for (let y = 0; y <= H; y += 128) g += `<text x="${x + 3}" y="${y + 14}" fill="#ff2d95" font-size="13" font-family="monospace">${x},${y}</text>`
g += '</svg>'
await sharp('00-tasks/task-1/palette.png').flatten({ background: '#ffffff' }).composite([{ input: Buffer.from(g) }]).png().toFile(S + 'ref-grid.png')
await sharp(S + 'ref-grid.png').extract({ left: 448, top: 512, width: 576, height: 448 }).resize(1008).png().toFile(S + 'ref-grid-br.png')
console.log('ok')
