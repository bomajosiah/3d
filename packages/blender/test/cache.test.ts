import { expect, it } from 'vitest'
import { cacheHash } from '../src/build.ts'
it('invalidates geometry on source, dependency, parameter, or Blender version changes', () => {
  const sources=[{path:'builder.py',content:'a'},{path:'helper.py',content:'b'}]
  const key=cacheHash({width:1,depth:2},'Blender 4.5',sources)
  expect(cacheHash({depth:2,width:1},'Blender 4.5',[...sources].reverse())).toBe(key)
  expect(cacheHash({width:2,depth:2},'Blender 4.5',sources)).not.toBe(key)
  expect(cacheHash({width:1,depth:2},'Blender 5.0',sources)).not.toBe(key)
  expect(cacheHash({width:1,depth:2},'Blender 4.5',[sources[0]!,{path:'helper.py',content:'c'}])).not.toBe(key)
})
