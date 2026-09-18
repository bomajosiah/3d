/** Studio smoke test. Starts its own studio on STUDIO_PORT (default 5176) and
 *  tears it down, so it never collides with a `pnpm studio` you have running.
 *  Creates and removes isolated fixtures. Run with `pnpm check:studio`. */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

// playwright is a dependency of @3d/render, not of the root. Resolve it from
// that package so the package manager decides where the files actually live.
const fromRender = createRequire(resolve('packages/render/package.json'))
const playwright = await import(pathToFileURL(fromRender.resolve('playwright')))
const chromium = playwright.chromium ?? playwright.default.chromium  // resolves to the CJS entry

const port = Number(process.env.STUDIO_PORT ?? 5176)
const origin = `http://127.0.0.1:${port}`
const studioDir = resolve('apps/studio')

const fixture = resolve('scenes/studio-smoke.scene.json')
const builderDir = resolve('assets/studio-smoke')
const builder = resolve(builderDir, 'probe.py')
mkdirSync(builderDir, { recursive: true })
writeFileSync(builder, "from modeling import mesh, bevel\ndef build(p):\n    return [bevel(mesh('probe', [(-.04,0,-.02),(.04,0,-.02),(.04,.08,-.02),(-.04,.08,-.02),(-.04,0,.02),(.04,0,.02),(.04,.08,.02),(-.04,.08,.02)], [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]),.005)]\n")
writeFileSync(fixture, JSON.stringify({ name:'studio-smoke', materials:{blue:{color:'#6699bb'}}, nodes:[{type:'asset',name:'probe',builder:'../assets/studio-smoke/probe.py',material:'blue'},{type:'reference',image:'references/cutlery-target.png',height:.12,transform:{position:[.12,.06,0]}}] }))

// --host 127.0.0.1 matters: left to itself vite binds localhost as ::1, which
// this script and Playwright would not reach on the 127.0.0.1 origin below.
const studio = spawn(process.execPath, [resolve(studioDir,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'], { cwd: studioDir, stdio: ['ignore','pipe','pipe'], detached: true })
let studioOutput = ''
for (const stream of [studio.stdout, studio.stderr]) stream.on('data', chunk => { studioOutput = (studioOutput + chunk).slice(-4000) })

async function waitForStudio(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (studio.exitCode !== null) throw new Error(`studio exited with ${studio.exitCode} before serving ${origin}:\n${studioOutput}`)
    try { if ((await fetch(origin)).ok) return } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`studio did not answer on ${origin} within ${timeoutMs}ms:\n${studioOutput}`)
}

let browser
try {
  await waitForStudio()
  browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  const page=await browser.newPage({viewport:{width:1100,height:850}})
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)})
  page.on('response', async response => { if (response.url().includes('/__3d/scene?')) { const payload = await response.json(); if (!payload.ok) console.log('SCENE ERROR',JSON.stringify(payload)) } })
  await page.goto(origin)
  await page.locator('.project-trigger').click()
  await page.screenshot({path:'.3d/out/studio-project-picker.png'})
  await page.getByRole('button',{name:/studio-smoke/}).click()
  await page.getByRole('heading',{name:'studio-smoke',exact:true}).waitFor({timeout:120000})
  await page.waitForFunction(()=>{const c=document.querySelector('canvas');return c?.dataset.sceneReady==='studio-smoke' && c?.dataset.referencesReady==='studio-smoke'})
  await page.screenshot({path:'.3d/out/studio-reference.png'})
  writeFileSync(builder, "def build(p):\n    raise ValueError('deliberate smoke-test build failure')\n")
  await page.getByText('Preview · stale: build failed', {exact:false}).waitFor({timeout:120000})
  assert.equal(await page.locator('canvas').count(),1)
  await page.screenshot({path:'.3d/out/studio-stale.png'})
  assert.deepEqual(errors,[])
  await page.getByRole('button',{name:'studio-smoke',exact:true}).click()
  await page.getByRole('button',{name:/cutlery/}).click()
  await page.getByRole('heading',{name:'cutlery',exact:true}).waitFor({timeout:120000})
  await page.keyboard.press('Space')
  await page.keyboard.press('Meta+/')
  assert.equal(await page.locator('.interface').getAttribute('aria-hidden'),'true')
  await page.keyboard.press('Meta+/')
  assert.equal(await page.locator('.interface').getAttribute('aria-hidden'),'false')
  await page.getByRole('button',{name:'Export',exact:true}).click()
  await page.getByRole('heading',{name:'Export assets',exact:true}).waitFor()
  await page.getByText('256 · 512 · 768 px',{exact:true}).waitFor()
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.project-overlay').evaluate(el => getComputedStyle(el).opacity),'1')
  await page.screenshot({path:'.3d/out/studio-export.png'})
  await page.getByRole('button',{name:'Close export panel',exact:true}).click()
  const invalidExport = await page.evaluate(async () => {
    const response = await fetch('/__3d/exports', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({path:'missing',format:'flutter-ui-icon'}) })
    return response.status
  })
  assert.equal(invalidExport,400)
  await page.locator('input[type=range]').fill('0')
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.sceneReady==='cutlery')
  await page.screenshot({path:'.3d/out/studio-cutlery.png'})
  console.log('Studio passed: GLB, references, stale preview retention, project picker, export panel, and keyboard shortcuts.')
} finally {
  await browser?.close()
  // vite spawns workers; detached above puts them in their own group so this
  // takes the whole tree down and never leaves the port held.
  try { process.kill(-studio.pid, 'SIGTERM') } catch {}
  rmSync(fixture,{force:true});rmSync(builderDir,{recursive:true,force:true})
}
