import * as THREE from 'three'
import type { Clip, Keyframe, SceneDocument, Track, Vec3 } from '@3d/schema'
import { ease } from './easing.ts'
import { resolve, splitTarget } from './selector.ts'

type KeyValue = number | Vec3 | string

const keyTime = (k: Keyframe): number => k[0]
const keyValue = (k: Keyframe): KeyValue => k[1] as KeyValue
const keyEase = (k: Keyframe) => (k.length === 3 ? k[2] : undefined)

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function interpolate(a: KeyValue, b: KeyValue, t: number): KeyValue {
  if (typeof a === 'number' && typeof b === 'number') return lerp(a, b, t)
  if (Array.isArray(a) && Array.isArray(b)) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)] as Vec3
  }
  if (typeof a === 'string' && typeof b === 'string') {
    const ca = new THREE.Color(a)
    const cb = new THREE.Color(b)
    return `#${ca.lerp(cb, t).getHexString()}`
  }
  return t < 1 ? a : b
}

/** Value of a track at time `t`, clamped at both ends. */
export function sampleTrack(track: Track, t: number): KeyValue | undefined {
  const keys = track.keys
  if (!keys.length) return undefined
  const first = keys[0]!
  if (t <= keyTime(first)) return keyValue(first)
  const last = keys[keys.length - 1]!
  if (t >= keyTime(last)) return keyValue(last)

  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!
    const b = keys[i + 1]!
    const ta = keyTime(a)
    const tb = keyTime(b)
    if (t >= ta && t <= tb) {
      const span = tb - ta
      const raw = span <= 0 ? 1 : (t - ta) / span
      // The easing on the LATER key describes the segment arriving at it,
      // matching how motion tools present it to a designer.
      return interpolate(keyValue(a), keyValue(b), ease(keyEase(b), raw))
    }
  }
  return keyValue(last)
}

/** Maps wall-clock seconds onto a clip's local time, honouring its loop mode. */
export function clipTime(clip: Clip, t: number): number {
  const d = clip.duration
  if (d <= 0) return 0
  if (clip.loop === 'once') return Math.min(t, d)
  const cycles = t / d
  if (clip.loop === 'pingpong') {
    const phase = cycles % 2
    return phase <= 1 ? phase * d : (2 - phase) * d
  }
  return (t % d + d) % d
}

const DEG = Math.PI / 180

function applyProperty(obj: THREE.Object3D, property: string[], value: KeyValue): void {
  const [root, field, axis] = property
  if (root !== 'transform') {
    if (root === 'visible') obj.visible = Boolean(value)
    return
  }
  const vec =
    field === 'position' ? obj.position : field === 'rotation' ? obj.rotation : field === 'scale' ? obj.scale : undefined
  if (!vec) return
  const scale = field === 'rotation' ? DEG : 1

  if (axis && (axis === 'x' || axis === 'y' || axis === 'z')) {
    if (typeof value === 'number') (vec as unknown as Record<string, number>)[axis] = value * scale
    return
  }
  if (Array.isArray(value)) {
    ;(vec as THREE.Vector3 | THREE.Euler).set(value[0] * scale, value[1] * scale, value[2] * scale)
  }
}

export function selectClip(doc: SceneDocument, name?: string): Clip | undefined {
  const clips = doc.animation.clips
  if (!clips.length) return undefined
  if (!name) return clips[0]
  return clips.find((c) => c.name === name) ?? clips[0]
}

/**
 * Applies the document's animation to an already-built scene at time `t`.
 * Kept separate from `buildScene` so a 60-frame export builds geometry once
 * and only re-evaluates transforms per frame.
 */
export function evaluateAt(
  doc: SceneDocument,
  root: THREE.Object3D,
  t: number,
  clipName?: string,
): void {
  const clip = selectClip(doc, clipName)
  if (!clip) return
  const local = clipTime(clip, t)

  for (const track of clip.tracks) {
    const { selector, property } = splitTarget(track.target)
    if (!property.length) continue
    const value = sampleTrack(track, local)
    if (value === undefined) continue
    for (const obj of resolve(root, selector)) applyProperty(obj, property, value)
  }
}

/** Total duration across clips — what `sheet` and the exporters sample over. */
export const durationOf = (doc: SceneDocument, clipName?: string): number =>
  selectClip(doc, clipName)?.duration ?? 0
