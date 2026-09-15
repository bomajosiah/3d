import { z } from 'zod'

/** A finite number. Rejects NaN/Infinity, which silently corrupt transforms. */
export const Num = z.number().finite()

export const Vec3 = z.tuple([Num, Num, Num])
export type Vec3 = z.infer<typeof Vec3>

/** sRGB hex, `#rgb` or `#rrggbb` (optionally with alpha). */
export const Color = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'expected a hex color like "#e8d5b7"')
export type Color = z.infer<typeof Color>

/**
 * Stable 8-char id. Authors never write these by hand — `3d fmt` fills them in
 * and they are never regenerated, because tracks and UI selection reference them.
 */
export const Id = z.string().regex(/^[0-9a-zA-Z_-]{4,24}$/)

/** A 2D outline, as SVG path data. Agents know `d` syntax; it round-trips losslessly. */
export const Path2D = z.object({
  d: z.string().min(1).meta({ description: 'SVG path data, e.g. "M0,0 L1,0 L1,1 Z"' }),
  closed: z.boolean().default(true),
})

/** Rotations are DEGREES in the document and radians internally. */
export const Transform = z.object({
  position: Vec3.default([0, 0, 0]),
  rotation: Vec3.default([0, 0, 0]).meta({ unit: 'deg' }),
  scale: z
    .union([Vec3, Num])
    .default(1)
    .transform((s): Vec3 => (typeof s === 'number' ? [s, s, s] : s)),
})
export type Transform = z.infer<typeof Transform>
