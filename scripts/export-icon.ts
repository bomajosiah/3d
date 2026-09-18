import { exportFlutterIcon } from '@3d/blender'

const scene = process.argv[2]
if (!scene) throw new Error('usage: pnpm icon <scene> [output-directory]')

const result = await exportFlutterIcon(scene, { output: process.argv[3] })
console.log(`exported ${result.name}: ${result.frames} transparent frames @ ${result.fps}fps → ${result.output}`)
