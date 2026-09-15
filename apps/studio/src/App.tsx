import { useEffect, useRef, useState } from 'react'
import { durationOf } from '@3d/core'
import { Viewport } from './Viewport.tsx'
import { useScene } from './useScene.ts'

type SceneEntry = { path: string; name: string }

export function App() {
  const [scenes, setScenes] = useState<SceneEntry[]>([])
  const [path, setPath] = useState<string>()
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(true)
  const raf = useRef(0)
  const last = useRef(performance.now())

  useEffect(() => {
    fetch('/__3d/scenes')
      .then((r) => r.json())
      .then((list: SceneEntry[]) => {
        setScenes(list)
        setPath((current) => current ?? list[0]?.path)
      })
  }, [])

  const state = useScene(path)
  const duration = state.status === 'ok' ? durationOf(state.doc) : 0

  useEffect(() => {
    if (!playing || duration <= 0) return
    last.current = performance.now()
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000
      last.current = now
      setTime((t) => (t + dt) % duration)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, duration])

  return (
    <div className="app">
      {state.status === 'ok' && <Viewport doc={state.doc} time={time} />}

      <div className="hud">
        <h1>{state.status === 'ok' ? state.doc.name : 'loading…'}</h1>
        <p>
          {state.status === 'ok'
            ? `Preview${state.stale ? ' · stale: build failed' : ''} · ${state.doc.environment.preset}`
            : 'waiting for a valid scene'}
        </p>
      </div>

      {(state.status === 'invalid' || state.status === 'ok' && state.stale) && (
        <div className="errors">
          <h2>{state.name} has {state.diagnostics?.length} error(s)</h2>
          {state.diagnostics?.map((d, i) => (
            <code key={i}>
              {d.line ? `${state.name}:${d.line}:${d.column}  ` : ''}
              {d.message}
              {d.path.length ? `  at /${d.path.join('/')}` : ''}
            </code>
          ))}
        </div>
      )}

      <div className="bar">
        <select value={path ?? ''} onChange={(e) => setPath(e.target.value)}>
          {scenes.map((s) => (
            <option key={s.path} value={s.path}>{s.name}</option>
          ))}
        </select>
        <button onClick={() => setPlaying((p) => !p)} disabled={duration <= 0}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.001)}
          step={0.001}
          value={Math.min(time, duration)}
          disabled={duration <= 0}
          onChange={(e) => {
            setPlaying(false)
            setTime(Number(e.target.value))
          }}
        />
        <span className="time">
          {duration > 0 ? `${time.toFixed(2)}s / ${duration.toFixed(2)}s` : 'static scene'}
        </span>
      </div>
    </div>
  )
}
