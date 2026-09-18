export type ExportFormatId = 'flutter-ui-icon'

export type ExportSetting = { id: string; label: string; value: string; detail?: string }

export type ExportFormat = {
  id: ExportFormatId
  name: string
  description: string
  deliverables: string
  settings: ExportSetting[]
}

/** UI metadata stays separate from server handlers so formats remain additive. */
export const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: 'flutter-ui-icon',
    name: 'Flutter UI icon',
    description: 'Transparent, density-aware assets for short interface interactions.',
    deliverables: 'PNG · animated WebP · sprite atlas',
    settings: [
      { id: 'master', label: 'Render master', value: '1536 × 1536', detail: 'Cycles · 24 samples' },
      { id: 'sizes', label: 'Output sizes', value: '256 · 512 · 768 px', detail: '1× · 2× · 3×' },
      { id: 'motion', label: 'Motion', value: '24 fps', detail: 'Full scene clip' },
      { id: 'background', label: 'Background', value: 'Transparent', detail: 'No floor shadow' },
    ],
  },
]
