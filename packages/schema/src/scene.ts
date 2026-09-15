import { z } from 'zod'
import { Color, Num, Vec3 } from './primitives.ts'
import { SceneNode } from './nodes.ts'

export const Material = z.object({
  type: z.enum(['physical', 'unlit']).default('physical'),
  color: Color.default('#c9c4bb'),
  roughness: Num.min(0).max(1).default(0.45),
  metalness: Num.min(0).max(1).default(0),
  opacity: Num.min(0).max(1).default(1),
  emissive: Color.optional(),
  flatShading: z.boolean().default(false),
})
export type Material = z.infer<typeof Material>

/**
 * Presets install a whole light rig. This is how an agent gets good lighting
 * without reasoning about light placement — the highest-leverage quality lever
 * in the tool.
 */
export const ENVIRONMENT_PRESETS = [
  'studio-soft',
  'studio-contrast',
  'product-white',
  'warm-key',
  'rim-dark',
  'flat-icon',
] as const

export const Environment = z.object({
  preset: z.enum(ENVIRONMENT_PRESETS).default('studio-soft'),
  background: z.union([Color, z.literal('transparent')]).default('transparent'),
  intensity: Num.min(0).default(1),
  rotation: Num.default(0).meta({ unit: 'deg' }),
  exposure: Num.min(-8).max(8).default(0).meta({ description: 'Final render exposure in stops.' }),
  floor: z.object({
    mode: z.enum(['shadow', 'solid', 'none']).default('shadow'),
    color: Color.default('#f5f3f0'),
  }).prefault({}),
  lights: z.array(z.object({
    position: Vec3,
    target: Vec3.default([0, 0, 0]),
    size: Num.positive(),
    power: Num.positive().meta({ description: 'Area light power in watts (final render).' }),
    color: Color.default('#ffffff'),
  })).default([]),
  ao: Num.min(0).max(2).default(1).meta({
    description: 'Ambient occlusion strength. 0 disables it. Crevices need this to read.',
  }),
  aoRadius: Num.positive().default(0.02).meta({
    unit: 'm',
    description: 'How far occlusion reaches, in scene units. Roughly the size of the gaps you want darkened.',
  }),
})

export const VIEWS = ['iso', 'front', 'back', 'left', 'right', 'top', 'bottom'] as const
export type View = (typeof VIEWS)[number]

export const Camera = z.object({
  type: z.enum(['perspective', 'orthographic']).default('perspective'),
  fov: Num.min(1).max(170).default(30),
  position: Vec3.optional().meta({ description: 'Omit to let `framing` place the camera.' }),
  target: Vec3.default([0, 0, 0]),
  framing: z
    .object({
      fit: z.string().default('all').meta({ description: '"all" or a node selector.' }),
      view: z.enum(VIEWS).default('iso'),
      region: z.object({ center: Vec3, radius: Num.positive() }).optional().meta({ description: 'Fixed world-space inspection region; overrides automatic bounds.' }),
      padding: Num.min(0).max(2).default(0.1),
    })
    .prefault({}),
})
export type Camera = z.infer<typeof Camera>

export const EASINGS = [
  'linear',
  'inQuad', 'outQuad', 'inOutQuad',
  'inCubic', 'outCubic', 'inOutCubic',
  'inQuart', 'outQuart', 'inOutQuart',
  'inExpo', 'outExpo', 'inOutExpo',
  'inCirc', 'outCirc', 'inOutCirc',
  'inBack', 'outBack', 'inOutBack',
  'inElastic', 'outElastic', 'inOutElastic',
] as const
export type Easing = (typeof EASINGS)[number]

/** `[time, value]` or `[time, value, easing]` — one line per key in a diff. */
export const Keyframe = z.union([
  z.tuple([Num, z.union([Num, Vec3, Color])]),
  z.tuple([Num, z.union([Num, Vec3, Color]), z.enum(EASINGS)]),
])
export type Keyframe = z.infer<typeof Keyframe>

export const Track = z.object({
  target: z.string().min(1).meta({ description: 'Selector + property path, e.g. "lid.transform.rotation.y"' }),
  keys: z.array(Keyframe).min(1),
})
export type Track = z.infer<typeof Track>

export const Clip = z.object({
  name: z.string().default('default'),
  duration: Num.positive().default(2),
  fps: z.number().int().min(1).max(120).default(30),
  loop: z.enum(['once', 'forever', 'pingpong']).default('forever'),
  tracks: z.array(Track).default([]),
})
export type Clip = z.infer<typeof Clip>

export const SceneDocument = z.object({
  version: z.literal(1).default(1),
  name: z.string().min(1).default('untitled'),
  environment: Environment.prefault({}),
  camera: Camera.prefault({}),
  materials: z.record(z.string(), Material).default({}),
  nodes: z.array(SceneNode).default([]),
  animation: z.object({ clips: z.array(Clip).default([]) }).prefault({}),
  meta: z.record(z.string(), z.unknown()).optional(),
})
export type SceneDocument = z.infer<typeof SceneDocument>
/** The shape an author writes: everything optional, defaults fill the rest. */
export type SceneDocumentInput = z.input<typeof SceneDocument>
