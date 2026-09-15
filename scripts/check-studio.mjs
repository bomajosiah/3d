/** Run with the studio at 127.0.0.1:5176. Creates and removes isolated smoke fixtures. */
import { chromium } from '../packages/render/node_modules/playwright/index.mjs'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const fixture = resolve('examples/studio-smoke.scene.json')
const builderDir = resolve('assets/studio-smoke')
const builder = resolve(builderDir, 'probe.py')
mkdirSync(builderDir, { recursive: true })
writeFileSync(builder, "from modeling import mesh, bevel\ndef build(p):\n    return [bevel(mesh('probe', [(-.04,0,-.02),(.04,0,-.02),(.04,.08,-.02),(-.04,.08,-.02),(-.04,0,.02),(.04,0,.02),(.04,.08,.02),(-.04,.08,.02)], [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]),.005)]\n")
writeFileSync(fixture, JSON.stringify({ name:'studio-smoke', materials:{blue:{color:'#6699bb'}}, nodes:[{type:'asset',name:'probe',builder:'../assets/studio-smoke/probe.py',material:'blue'},{type:'reference',image:'references/cutlery-target.png',height:.12,transform:{position:[.12,.06,0]}}] }))
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try {
  const page=await browser.newPage({viewport:{width:1100,height:850}})
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)})
  page.on('response', async response => { if (response.url().includes('/__3d/scene?')) { const payload = await response.json(); if (!payload.ok) console.log('SCENE ERROR',JSON.stringify(payload)) } })
  await page.goto('http://127.0.0.1:5176/')
  await page.locator('select').selectOption(fixture)
  await page.getByRole('heading',{name:'studio-smoke',exact:true}).waitFor({timeout:120000})
  await page.waitForFunction(()=>{const c=document.querySelector('canvas');return c?.dataset.sceneReady==='studio-smoke' && c?.dataset.referencesReady==='studio-smoke'})
  await page.screenshot({path:'.3d/out/studio-reference.png'})
  writeFileSync(builder, "def build(p):\n    raise ValueError('deliberate smoke-test build failure')\n")
  await page.getByText('Preview · stale: build failed', {exact:false}).waitFor({timeout:120000})
  assert.equal(await page.locator('canvas').count(),1)
  await page.screenshot({path:'.3d/out/studio-stale.png'})
  assert.deepEqual(errors,[])
  await page.locator('select').selectOption(resolve('scenes/cutlery.scene.json'))
  await page.getByRole('heading',{name:'cutlery',exact:true}).waitFor({timeout:120000})
  await page.getByRole('button',{name:'Pause',exact:true}).click()
  await page.locator('input[type=range]').fill('0')
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.sceneReady==='cutlery')
  await page.screenshot({path:'.3d/out/studio-cutlery.png'})
  console.log('Studio passed: GLB, reference loading, stale preview retention, and scene switching.')
} finally { await browser.close();rmSync(fixture,{force:true});rmSync(builderDir,{recursive:true,force:true}) }
