import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { durationOf } from '@3d/core'
import { Viewport } from './Viewport.tsx'
import { useScene } from './useScene.ts'
import { EXPORT_FORMATS, type ExportFormatId } from './exportFormats.ts'

type SceneEntry = { path: string; name: string }
type ExportJob = {
  id: string
  scene: string
  format: ExportFormatId
  status: 'queued' | 'running' | 'complete' | 'failed'
  progress: number
  stage: string
  output?: string
  error?: string
}

const displayName = (scene: SceneEntry) => scene.name.replace(/\.scene\.json$/, '')

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3 3" />
    </svg>
  )
}

function ChevronIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6 3 3 3-3" /></svg>
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2v8m0 0 3-3m-3 3L5 7M3 12.5h10" />
    </svg>
  )
}

function ProjectPicker({ scenes, selectedPath, onSelect, onClose }: {
  scenes: SceneEntry[]
  selectedPath: string | undefined
  onSelect: (path: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return needle ? scenes.filter((scene) => displayName(scene).toLocaleLowerCase().includes(needle)) : scenes
  }, [query, scenes])
  const projects = filtered.sort((a, b) => displayName(a).localeCompare(displayName(b)))

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="project-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="project-title">
        <header className="project-modal__header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2 id="project-title">Choose a project</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close project picker">×</button>
        </header>

        <label className="project-search">
          <SearchIcon />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects…"
            aria-label="Search projects"
          />
          <kbd>Esc</kbd>
        </label>

        <div className="project-list">
          {projects.length > 0 && (
            <section className="project-group">
              <h3>Projects<span>{projects.length}</span></h3>
              <div className="project-grid">
                {projects.map((scene) => {
                  const selected = scene.path === selectedPath
                  return (
                    <button
                      key={scene.path}
                      ref={selected ? selectedRef : undefined}
                      className="project-card"
                      aria-current={selected ? 'true' : undefined}
                      onClick={() => onSelect(scene.path)}
                    >
                      <span className="project-card__mark">{displayName(scene).slice(0, 1).toLocaleUpperCase()}</span>
                      <span className="project-card__copy">
                        <strong>{displayName(scene)}</strong>
                        <small>{selected ? 'Open now' : scene.name}</small>
                      </span>
                      <span className="project-card__status" aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
            </section>
          )}
          {!filtered.length && (
            <div className="project-empty">
              <strong>No matching projects</strong>
              <span>Try a shorter name.</span>
            </div>
          )}
        </div>

        <footer className="project-modal__footer">
          <span>{scenes.length} projects</span>
        </footer>
      </section>
    </div>
  )
}

const ExportDialog = memo(function ExportDialog({ sceneName, job, onExport, onClose }: {
  sceneName: string
  job: ExportJob | null
  onExport: (format: ExportFormatId) => void
  onClose: () => void
}) {
  const [formatId, setFormatId] = useState<ExportFormatId>(EXPORT_FORMATS[0]!.id)
  const exportButtonRef = useRef<HTMLButtonElement>(null)
  const format = EXPORT_FORMATS.find((entry) => entry.id === formatId) ?? EXPORT_FORMATS[0]!
  const working = job?.status === 'queued' || job?.status === 'running'

  useEffect(() => { exportButtonRef.current?.focus() }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="project-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <header className="project-modal__header">
          <div>
            <p className="eyebrow">{sceneName}</p>
            <h2 id="export-title">Export assets</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close export panel">×</button>
        </header>

        <div className="export-layout">
          <nav className="export-formats" aria-label="Export formats">
            <p>Format</p>
            {EXPORT_FORMATS.map((entry) => (
              <button
                key={entry.id}
                aria-current={entry.id === formatId ? 'true' : undefined}
                disabled={working}
                onClick={() => setFormatId(entry.id)}
              >
                <span className="format-mark"><ExportIcon /></span>
                <span><strong>{entry.name}</strong><small>{entry.deliverables}</small></span>
              </button>
            ))}
          </nav>

          <div className="export-details">
            <div className="export-intro">
              <h3>{format.name}</h3>
              <p>{format.description}</p>
            </div>
            <dl className="export-settings">
              {format.settings.map((setting) => (
                <div key={setting.id}>
                  <dt>{setting.label}</dt>
                  <dd><strong>{setting.value}</strong>{setting.detail && <small>{setting.detail}</small>}</dd>
                </div>
              ))}
              <div>
                <dt>Destination</dt>
                <dd><strong>dist/icons/{sceneName}</strong><small>Existing files are replaced</small></dd>
              </div>
            </dl>

            {job && (
              <div className={`export-status export-status--${job.status}`} aria-live="polite">
                <div className="export-status__copy">
                  <strong>{job.stage}</strong>
                  <span>{job.status === 'failed' ? job.error : job.status === 'complete' ? job.output : `${job.progress}%`}</span>
                </div>
                {working && <div className="export-progress"><span style={{ width: `${job.progress}%` }} /></div>}
              </div>
            )}
          </div>
        </div>

        <footer className="export-modal__footer">
          <span>Rendering continues if this panel is closed.</span>
          <button
            ref={exportButtonRef}
            className="export-primary"
            disabled={working}
            onClick={() => onExport(formatId)}
          >
            {working ? `Exporting ${job?.progress ?? 0}%` : job?.status === 'failed' ? 'Try again' : job?.status === 'complete' ? 'Export again' : `Export ${sceneName}`}
          </button>
        </footer>
      </section>
    </div>
  )
})

export function App() {
  const [scenes, setScenes] = useState<SceneEntry[]>([])
  const [path, setPath] = useState<string>()
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [interfaceVisible, setInterfaceVisible] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportJob, setExportJob] = useState<ExportJob | null>(null)
  const pickerButtonRef = useRef<HTMLButtonElement>(null)
  const exportButtonRef = useRef<HTMLButtonElement>(null)
  const raf = useRef(0)
  const last = useRef(performance.now())

  useEffect(() => {
    fetch('/__3d/scenes')
      .then((response) => response.json())
      .then((list: SceneEntry[]) => {
        setScenes(list)
        setPath((current) => current ?? list[0]?.path)
      })
  }, [])

  const state = useScene(path)
  const duration = state.status === 'ok' ? durationOf(state.doc) : 0
  const currentScene = scenes.find((scene) => scene.path === path)

  useEffect(() => {
    if (!playing || duration <= 0) return
    last.current = performance.now()
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000
      last.current = now
      setTime((current) => (current + dt) % duration)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, duration])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isControl = target?.matches('button, input, textarea, select, [contenteditable="true"]')

      if (event.metaKey && (event.key === '/' || event.code === 'Slash')) {
        event.preventDefault()
        setInterfaceVisible((visible) => {
          if (visible) {
            setPickerOpen(false)
            setExportOpen(false)
          }
          return !visible
        })
        return
      }

      if (event.code === 'Space' && (!isControl || !interfaceVisible) && duration > 0) {
        event.preventDefault()
        setPlaying((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [duration, interfaceVisible])

  const closePicker = useCallback(() => {
    setPickerOpen(false)
    requestAnimationFrame(() => pickerButtonRef.current?.focus())
  }, [])

  const closeExport = useCallback(() => {
    setExportOpen(false)
    requestAnimationFrame(() => exportButtonRef.current?.focus())
  }, [])

  const startExport = useCallback(async (format: ExportFormatId) => {
    if (!path) return
    setExportJob({ id: '', scene: path, format, status: 'queued', progress: 0, stage: 'Starting export' })
    try {
      const response = await fetch('/__3d/exports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, format, settings: {} }),
      })
      const payload = await response.json() as ExportJob & { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Export could not start')
      setExportJob(payload)
    } catch (error) {
      setExportJob({ id: '', scene: path, format, status: 'failed', progress: 0, stage: 'Export failed', error: error instanceof Error ? error.message : String(error) })
    }
  }, [path])

  useEffect(() => {
    if (!exportJob?.id || exportJob.status === 'complete' || exportJob.status === 'failed') return
    let active = true
    const poll = async () => {
      try {
        const response = await fetch(`/__3d/exports/${exportJob.id}`)
        const payload = await response.json() as ExportJob
        if (active && response.ok) setExportJob(payload)
      } catch {
        // A transient poll failure should not turn a healthy Blender job red.
      }
    }
    const timer = window.setInterval(poll, 1500)
    void poll()
    return () => { active = false; window.clearInterval(timer) }
  }, [exportJob?.id, exportJob?.status])

  const selectProject = (nextPath: string) => {
    setPath(nextPath)
    setTime(0)
    setPickerOpen(false)
    setExportJob((current) => current?.status === 'queued' || current?.status === 'running' ? current : null)
  }

  return (
    <div className="app">
      {state.status === 'ok' && <Viewport doc={state.doc} time={time} />}

      <div className={`interface ${interfaceVisible ? '' : 'interface--hidden'}`} aria-hidden={!interfaceVisible}>
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
            {state.diagnostics?.map((diagnostic, index) => (
              <code key={index}>
                {diagnostic.line ? `${state.name}:${diagnostic.line}:${diagnostic.column}  ` : ''}
                {diagnostic.message}
                {diagnostic.path.length ? `  at /${diagnostic.path.join('/')}` : ''}
              </code>
            ))}
          </div>
        )}

        <div className="bar">
          <button
            ref={pickerButtonRef}
            className="project-trigger"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
          >
            <span>{currentScene ? displayName(currentScene) : 'Projects'}</span>
            <ChevronIcon />
          </button>
          <button className="play-button" onClick={() => setPlaying((current) => !current)} disabled={duration <= 0}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            aria-label="Animation time"
            min={0}
            max={Math.max(duration, 0.001)}
            step={0.001}
            value={Math.min(time, duration)}
            disabled={duration <= 0}
            onChange={(event) => {
              setPlaying(false)
              setTime(Number(event.target.value))
            }}
          />
          <span className="time">
            {duration > 0 ? `${time.toFixed(2)}s / ${duration.toFixed(2)}s` : 'static scene'}
          </span>
          <button
            ref={exportButtonRef}
            className={`export-trigger ${exportJob?.status === 'running' || exportJob?.status === 'queued' ? 'export-trigger--running' : ''}`}
            disabled={state.status !== 'ok' || duration <= 0}
            onClick={() => {
              setPickerOpen(false)
              setExportOpen(true)
            }}
          >
            <ExportIcon />
            <span>Export</span>
          </button>
        </div>

      </div>

      {interfaceVisible && pickerOpen && (
        <ProjectPicker scenes={scenes} selectedPath={path} onSelect={selectProject} onClose={closePicker} />
      )}
      {interfaceVisible && exportOpen && currentScene && (
        <ExportDialog sceneName={displayName(currentScene)} job={exportJob} onExport={startExport} onClose={closeExport} />
      )}
    </div>
  )
}
