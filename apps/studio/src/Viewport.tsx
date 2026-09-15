import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { SceneDocument } from '@3d/schema'
import { applyFraming, makeCamera, loadReferences, applyEnvironment, applyRendererSettings, buildScene, createComposer, evaluateAt, stableSphere, type Composer } from '@3d/core'

type Props = { doc: SceneDocument; time: number }

function SceneContents({ doc, time }: Props) {
  const { camera, scene, gl, size } = useThree()
  const controls = useThree((state) => state.controls) as { target: THREE.Vector3; update: () => void } | null
  const framedFor = useRef<string>('')
  const framedControls = useRef<typeof controls>(null)
  const readyFrames = useRef(0)

  // Geometry is rebuilt only when the document itself changes; per-frame work is
  // limited to evaluating transforms, exactly as in the headless exporter.
  const built = useMemo(() => buildScene(doc), [doc])
  const [referenceError, setReferenceError] = useState('')
  useEffect(() => {
    let active = true
    setReferenceError('')
    readyFrames.current = 0
    gl.domElement.dataset.sceneReady = ''
    gl.domElement.dataset.referencesReady = ''
    loadReferences(built.content).then(() => { if (active) gl.domElement.dataset.referencesReady = doc.name }).catch(error => { if (active) setReferenceError(String(error)) })
    return () => { active = false }
  }, [built, gl, doc.name])

  // Frame once over the whole animation, exactly as the headless exporter does,
  // so a moving object does not appear to pulse in size.
  const sphere = useMemo(
    () => stableSphere(doc, built.content, (t) => evaluateAt(doc, built.content, t)),
    [doc, built],
  )

  // three.js resources are not garbage collected, so a long editing session
  // would leak a full set of geometries and materials on every file save. Only
  // the SUPERSEDED scene is disposed: React StrictMode replays effects, and a
  // cleanup keyed on the current value would dispose the scene still on screen.
  const previous = useRef<typeof built | null>(null)
  useEffect(() => {
    const stale = previous.current
    previous.current = built
    if (!stale || stale === built) return
    stale.root.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose?.()
      const material = mesh.material
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material?.dispose?.()
    })
  }, [built])

  useEffect(() => {
    scene.background = doc.environment.background === 'transparent' ? null : new THREE.Color(doc.environment.background)
  }, [scene, doc.environment.background])

  // The same procedural environment the exporter uses, so metals match.
  useEffect(() => {
    applyEnvironment(gl, scene, doc)
  }, [gl, scene, doc])

  useEffect(() => {
    // Re-frame when the document changes, but never while the user is orbiting.
    const key = `${doc.name}:${built.triangles}:${sphere.radius.toFixed(4)}:${JSON.stringify(doc.camera)}:${size.width}:${size.height}`
    if (framedFor.current === key && framedControls.current === controls) return
    framedFor.current = key
    framedControls.current = controls
    const aspect = size.width / size.height
    const framing = applyFraming(camera as THREE.PerspectiveCamera | THREE.OrthographicCamera, doc, sphere, aspect)
    if (controls) { controls.target.copy(framing.target); controls.update() }
  }, [camera, controls, doc, sphere, built, size.width, size.height])

  // The same AO composer the exporter uses. Without it the editor would show
  // flat crevices and the export would not, which is the drift this whole
  // package layout exists to prevent.
  const composer = useRef<Composer | undefined>(undefined)
  useEffect(() => {
    composer.current?.dispose()
    composer.current = createComposer(gl, scene, camera, doc, size.width, size.height)
    return () => {
      composer.current?.dispose()
      composer.current = undefined
    }
  }, [gl, scene, camera, doc, size.width, size.height])

  useFrame(() => {
    evaluateAt(doc, built.content, time)
    if (composer.current) composer.current.render()
    else gl.render(scene, camera)
    if (controls && ++readyFrames.current >= 3) gl.domElement.dataset.sceneReady = doc.name
  }, 1)

  // A primitive is not reactive: without a key that changes with the object,
  // React keeps the previous scene mounted and edits appear to half-apply.
  return <><primitive key={built.root.uuid} object={built.root} />{referenceError && <Html center><div role="alert">Reference image failed: {referenceError}</div></Html>}</>
}

export function Viewport({ doc, time }: Props) {
  const camera = useMemo(() => makeCamera(doc, 1), [doc.camera.type])
  return (
    <Canvas
      className="viewport"
      shadows
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      camera={camera}
      onCreated={({ gl }) => applyRendererSettings(gl)}
    >
      <SceneContents doc={doc} time={time} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  )
}
