import * as THREE from 'three'

/**
 * Renderer settings shared by the headless exporter and the browser viewport.
 * These live in core rather than in each renderer because a mismatch here is
 * invisible in code review and shows up only as "the export looks different
 * from the editor" — the exact drift this package exists to prevent.
 */
export const RENDERER_SETTINGS = {
  /**
   * Khronos PBR Neutral rather than ACES. ACES is built for filmic footage and
   * noticeably desaturates and darkens saturated albedo — a gold icon renders
   * olive under it. Neutral preserves base colour, which is what product and
   * icon work wants.
   */
  toneMapping: THREE.NeutralToneMapping,
  toneMappingExposure: 1,
  outputColorSpace: THREE.SRGBColorSpace,
  shadowMapType: THREE.PCFShadowMap,
} as const

export function applyRendererSettings(renderer: THREE.WebGLRenderer): void {
  renderer.toneMapping = RENDERER_SETTINGS.toneMapping
  renderer.toneMappingExposure = RENDERER_SETTINGS.toneMappingExposure
  renderer.outputColorSpace = RENDERER_SETTINGS.outputColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = RENDERER_SETTINGS.shadowMapType
}
