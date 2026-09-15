import { z } from 'zod'
import { Color, Id, Num, Path2D, Transform, Vec3 } from './primitives.ts'

/**
 * Modifiers apply in array order after the node's base geometry is built.
 * v0 ships none of these as no-ops; they are declared so the schema (and the
 * generated docs) describe the real shape from the start.
 */
export const Modifier = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bevel'), size: Num.default(0.01), segments: z.number().int().min(1).max(8).default(2) }),
  z.object({ type: z.literal('array'), count: z.number().int().min(1).default(2), offset: Vec3.default([1, 0, 0]) }),
  z.object({
    type: z.literal('mirror'),
    axis: z.enum(['x', 'y', 'z']).default('x'),
    merge: z.boolean().default(true),
  }),
])
export type Modifier = z.infer<typeof Modifier>

/** Fields every node carries, whatever its type. */
const common = {
  id: Id.optional().meta({ description: 'Filled by `3d fmt`. Never hand-write this.' }),
  name: z.string().min(1).optional(),
  transform: Transform.prefault({}),
  material: z.string().optional().meta({ description: 'Key into the document `materials` map.' }),
  visible: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  modifiers: z.array(Modifier).max(0, "Modifiers on scene nodes are not implemented; use modeling helpers inside a procedural asset builder.").default([]),
}

const Box = z.object({
  type: z.literal('box'),
  size: z.union([Vec3, Num]).default(1).transform((s): Vec3 => (typeof s === 'number' ? [s, s, s] : s)),
  radius: Num.min(0).default(0).meta({ description: 'Corner rounding. The 3D-icon workhorse.' }),
  segments: z.number().int().min(1).max(12).default(3).meta({ description: 'Rounding smoothness.' }),
  ...common,
})

const Sphere = z.object({
  type: z.literal('sphere'),
  radius: Num.positive().default(0.5),
  segments: z.number().int().min(4).max(128).default(48),
  ...common,
})

const Cylinder = z.object({
  type: z.literal('cylinder'),
  radius: Num.positive().default(0.5),
  radiusTop: Num.min(0).optional(),
  height: Num.positive().default(1),
  radialSegments: z.number().int().min(3).max(256).default(48),
  ...common,
})

/**
 * Revolves a profile around the Y axis. The profile's x is radius (never
 * negative) and y is height. Trace up the outside and back down the inside to
 * get a hollow form — that is how a spoon bowl becomes genuinely concave.
 */
const Lathe = z.object({
  type: z.literal('lathe'),
  profile: Path2D.meta({ description: 'SVG path; x = radius, y = height.' }),
  segments: z.number().int().min(3).max(256).default(64),
  startAngle: Num.default(0).meta({ unit: 'deg' }),
  endAngle: Num.default(360).meta({ unit: 'deg' }),
  tolerance: Num.positive().default(0.004).meta({
    description: 'Max chord length when flattening curves, in scene units.',
  }),
  ...common,
})

/**
 * Extrudes a 2D outline along Z with an optional bevel. Extra subpaths in the
 * same `d` become holes, which is how slots and cut-outs are authored.
 */
const Extrude = z.object({
  type: z.literal('extrude'),
  path: Path2D.meta({ description: 'SVG path. Extra subpaths become holes.' }),
  origin: z.enum(['center', 'path']).default('center').meta({ description: 'center preserves legacy centering; path retains XY coordinates and centers only depth.' }),
  depth: Num.positive().default(0.1),
  bevel: Num.min(0).default(0).meta({ description: 'Bevel size; 0 disables bevelling.' }),
  bevelSegments: z.number().int().min(1).max(12).default(4),
  curveSegments: z.number().int().min(1).max(64).default(12),
  tolerance: Num.positive().default(0.004),
  ...common,
})

const Group = z.object({
  type: z.literal('group'),
  ...common,
})

/**
 * A blueprint image plane to model against. Rendered in the viewport and in
 * previews, and ALWAYS excluded from every export.
 */
const Reference = z.object({
  type: z.literal('reference'),
  image: z.string().min(1).meta({ description: 'Repo-relative path, usually under references/' }),
  view: z.enum(['front', 'back', 'left', 'right', 'top', 'bottom']).default('front'),
  opacity: Num.min(0).max(1).default(0.4),
  height: Num.positive().default(1).meta({ unit: 'm', description: 'Plane height in scene units.' }),
  ...common,
})

const Asset = z.object({
  type: z.literal('asset'),
  builder: z.string().min(1).meta({ description: 'Python builder path relative to the scene file; exports build(parameters).' }),
  parameters: z.record(z.string(), z.union([Num, z.string(), z.boolean()])).default({}),
  dependencies: z.array(z.string()).default([]),
  ...common,
})

const BaseNode = z.discriminatedUnion('type', [Box, Sphere, Cylinder, Lathe, Extrude, Group, Reference, Asset])
type BaseNode = z.infer<typeof BaseNode>
export type SceneNode = Exclude<BaseNode, { type: 'reference' }> & { children: SceneNode[] } | Extract<BaseNode, { type: 'reference' }>
export const SceneNode: z.ZodType<SceneNode> = z.lazy(() => z.discriminatedUnion('type', [
  Box.extend({ children: z.array(SceneNode).default([]) }),
  Sphere.extend({ children: z.array(SceneNode).default([]) }),
  Cylinder.extend({ children: z.array(SceneNode).default([]) }),
  Lathe.extend({ children: z.array(SceneNode).default([]) }),
  Extrude.extend({ children: z.array(SceneNode).default([]) }),
  Group.extend({ children: z.array(SceneNode).default([]) }),
  Asset.extend({ children: z.array(SceneNode).default([]) }),
  Reference,
])) as z.ZodType<SceneNode>

/** Node types that contribute geometry (i.e. everything but `reference`). */
export const GEOMETRY_TYPES = ['box', 'sphere', 'cylinder', 'lathe', 'extrude', 'asset'] as const
export const NODE_TYPES = ['box', 'sphere', 'cylinder', 'lathe', 'extrude', 'group', 'reference', 'asset'] as const
export type NodeType = (typeof NODE_TYPES)[number]

export const isContainer = (n: SceneNode): n is Extract<SceneNode, { children: SceneNode[] }> =>
  n.type !== 'reference'

export { Color }
