import { describe, expect, it } from 'vitest'
import { parseScene } from '@3d/schema'
import { EASING_FNS, buildScene, clipTime, evaluateAt, sampleTrack, stableSphere } from '../src/index.ts'

const track = (keys: unknown[]) => ({ target: 'x.transform.rotation.y', keys }) as never

describe('easing', () => {
  it('pins every curve to 0 and 1 at the endpoints', () => {
    for (const [name, fn] of Object.entries(EASING_FNS)) {
      expect(fn(0), name).toBeCloseTo(0, 5)
      expect(fn(1), name).toBeCloseTo(1, 5)
    }
  })

  it('overshoots for back easings, which is the whole point of them', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => EASING_FNS.outBack(i / 100)))
    expect(peak).toBeGreaterThan(1)
  })
})

describe('track sampling', () => {
  it('clamps outside the key range', () => {
    const t = track([[1, 10], [2, 20]])
    expect(sampleTrack(t, 0)).toBe(10)
    expect(sampleTrack(t, 5)).toBe(20)
  })

  it('interpolates linearly between keys', () => {
    expect(sampleTrack(track([[0, 0], [2, 100]]), 1)).toBe(50)
  })

  it('interpolates vectors componentwise', () => {
    expect(sampleTrack(track([[0, [0, 0, 0]], [1, [2, 4, 6]]]), 0.5)).toEqual([1, 2, 3])
  })
})

describe('clip time', () => {
  const clip = (loop: string) => ({ name: 'c', duration: 2, fps: 30, loop, tracks: [] }) as never
  it('wraps forever', () => expect(clipTime(clip('forever'), 2.5)).toBeCloseTo(0.5))
  it('holds at the end for once', () => expect(clipTime(clip('once'), 9)).toBe(2))
  it('reverses on the return leg for pingpong', () => {
    expect(clipTime(clip('pingpong'), 3)).toBeCloseTo(1)
    expect(clipTime(clip('pingpong'), 2.5)).toBeCloseTo(1.5)
  })
})

describe('framing stability', () => {
  it('covers the whole animation, so a moving object does not pulse in size', () => {
    const doc = parseScene({
      nodes: [{ type: 'box', name: 'cube' }],
      animation: {
        clips: [{ name: 'hop', duration: 2, tracks: [
          { target: 'cube.transform.position.y', keys: [[0, 0], [1, 3], [2, 0]] },
        ] }],
      },
    })
    const built = buildScene(doc)
    const sphere = stableSphere(doc, built.content, (t) => evaluateAt(doc, built.content, t))
    // Radius must reach the top of the hop, not just the rest pose.
    expect(sphere.radius).toBeGreaterThan(1.5)
  })
})

describe('bounds', () => {
  it('includes the offset of a parent group', () => {
    // Box3.setFromObject does not refresh ancestor matrices, so a node inside a
    // moved group was once measured at its local position and the group offset
    // vanished from the bounds — which then mis-framed the camera.
    const doc = parseScene({
      nodes: [
        { type: 'group', name: 'left', transform: { position: [-1, 0, 0] },
          children: [{ type: 'box', name: 'a', size: 0.5 }] },
        { type: 'group', name: 'right', transform: { position: [1, 0, 0] },
          children: [{ type: 'box', name: 'b', size: 0.5 }] },
      ],
    })
    const built = buildScene(doc)
    expect(built.bounds.min.x).toBeCloseTo(-1.25, 5)
    expect(built.bounds.max.x).toBeCloseTo(1.25, 5)
  })

  it('accounts for a scaled child', () => {
    const doc = parseScene({
      nodes: [{ type: 'box', name: 'a', size: 1, transform: { scale: [3, 1, 1] } }],
    })
    const built = buildScene(doc)
    expect(built.bounds.max.x - built.bounds.min.x).toBeCloseTo(3, 5)
  })
})

describe('degrees', () => {
  it('converts document degrees into radians on the object', () => {
    const doc = parseScene({
      nodes: [{ type: 'box', name: 'cube' }],
      animation: { clips: [{ name: 'spin', duration: 2, loop: 'once', tracks: [
        { target: 'cube.transform.rotation.y', keys: [[0, 0], [2, 180]] },
      ] }] },
    })
    const built = buildScene(doc)
    evaluateAt(doc, built.content, 2)
    expect(built.content.children[0]!.rotation.y).toBeCloseTo(Math.PI, 5)
  })

  it('wraps a looping clip at exactly its duration back to the start', () => {
    const doc = parseScene({
      nodes: [{ type: 'box', name: 'cube' }],
      animation: { clips: [{ name: 'spin', duration: 2, loop: 'forever', tracks: [
        { target: 'cube.transform.rotation.y', keys: [[0, 0], [2, 360]] },
      ] }] },
    })
    const built = buildScene(doc)
    evaluateAt(doc, built.content, 2)
    expect(built.content.children[0]!.rotation.y).toBeCloseTo(0, 5)
  })
})
