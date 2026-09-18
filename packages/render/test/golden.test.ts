import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSceneText } from '@3d/schema'
import { compareImages, diffSheet, renderFrames } from '../src/index.ts'

const FIXTURES = join(process.cwd(), 'packages/render/test/fixtures')
const GOLDEN = join(FIXTURES, '__golden__')
const UPDATE = process.env.UPDATE_GOLDEN === '1'
const SIZE = 192

/**
 * Ambient occlusion is not bit-reproducible across GPU contexts, so these
 * compare perceptually rather than per-pixel. The gate sits in a wide gap:
 * measured run-to-run noise is under 0.15% of pixels, while a barely visible
 * change (one channel of one material by 6/255) registers over 5%. Run with
 * UPDATE_GOLDEN=1 to re-bless after an intentional change.
 */
const PREFILTER = 2
const TOLERANCE = 0.01
const CASES = [
  { file: 'rounded-cube.scene.json', time: 0.4 },
  { file: 'side-table.scene.json', time: 0 },
]

describe('golden renders', () => {
  mkdirSync(GOLDEN, { recursive: true })

  for (const testCase of CASES) {
    it(`matches the committed render of ${testCase.file}`, async () => {
      const path = join(FIXTURES, testCase.file)
      const doc = parseSceneText(readFileSync(path, 'utf8'), path)
      const { frames } = await renderFrames(doc, [{ time: testCase.time }], { width: SIZE, height: SIZE })
      const actual = frames[0]!.png

      const goldenPath = join(GOLDEN, testCase.file.replace('.scene.json', '.png'))
      if (UPDATE) {
        writeFileSync(goldenPath, actual)
        return
      }

      if (!existsSync(goldenPath)) throw new Error(`Missing golden: ${goldenPath}. Review output, then explicitly run UPDATE_GOLDEN=1.`)
      const diff = await compareImages(readFileSync(goldenPath), actual, 6, PREFILTER)
      if (diff.changed > TOLERANCE) {
        const out = goldenPath.replace('.png', '.diff.png')
        writeFileSync(out, await diffSheet(readFileSync(goldenPath), actual))
        throw new Error(
          `${testCase.file} drifted: ${(diff.changed * 100).toFixed(2)}% of pixels changed ` +
            `(max channel delta ${diff.maxChannelDelta}). Wrote ${out}`,
        )
      }
      expect(diff.changed).toBeLessThanOrEqual(TOLERANCE)
    })
  }
})
