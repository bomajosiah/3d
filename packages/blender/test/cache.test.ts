import { expect, it } from 'vitest'
import { cacheHash } from '../src/build.ts'
it('invalidates geometry on source, dependency, parameter, or Blender version changes', () => {
  const sources=[{path:'builder.py',content:'a'},{path:'helper.py',content:'b'}]
  const key=cacheHash('builder.py',{width:1,depth:2},'Blender 4.5',sources)
  expect(cacheHash('builder.py',{depth:2,width:1},'Blender 4.5',[...sources].reverse())).toBe(key)
  expect(cacheHash('builder.py',{width:2,depth:2},'Blender 4.5',sources)).not.toBe(key)
  expect(cacheHash('builder.py',{width:1,depth:2},'Blender 5.0',sources)).not.toBe(key)
  expect(cacheHash('builder.py',{width:1,depth:2},'Blender 4.5',[sources[0]!,{path:'helper.py',content:'c'}])).not.toBe(key)
})

it('keeps two parameterless builders in one directory apart', () => {
  // The directory scan hands both of them exactly the same source bytes.
  const sources=[{path:'dice.py',content:'a'},{path:'running_shoe.py',content:'b'}]
  expect(cacheHash('dice.py',{},'Blender 4.5',sources))
    .not.toBe(cacheHash('running_shoe.py',{},'Blender 4.5',sources))
})
