import { exportFlutterIcon, type IconExportProgress } from '@3d/blender'
import type { ExportFormatId } from './src/exportFormats.ts'

export type ExportHandler = (
  scenePath: string,
  settings: Record<string, unknown>,
  onProgress: (update: IconExportProgress) => void,
) => Promise<{ output: string }>

export const exporters: Record<ExportFormatId, ExportHandler> = {
  'flutter-ui-icon': (scenePath, _settings, onProgress) => exportFlutterIcon(scenePath, { onProgress }),
}
