import { describe, expect, it } from 'vitest'
import { ValidationError, parseScene, parseSceneText, suggest } from '../src/index.ts'

describe('scene schema', () => {
  it('accepts a three-line document and fills every default', () => {
    const doc = parseScene({ name: 'cube', nodes: [{ type: 'box', name: 'cube' }] })
    const node = doc.nodes[0]!
    expect(node.type).toBe('box')
    if (node.type !== 'box') throw new Error('unreachable')
    expect(node.size).toEqual([1, 1, 1])
    expect(node.transform.scale).toEqual([1, 1, 1])
    expect(doc.camera.framing.view).toBe('iso')
    expect(doc.environment.preset).toBe('studio-soft')
  })

  it('expands scalar shorthands for size and scale', () => {
    const doc = parseScene({ nodes: [{ type: 'box', size: 2, transform: { scale: 0.5 } }] })
    const node = doc.nodes[0]!
    if (node.type !== 'box') throw new Error('unreachable')
    expect(node.size).toEqual([2, 2, 2])
    expect(node.transform.scale).toEqual([0.5, 0.5, 0.5])
  })

  it('nests children recursively', () => {
    const doc = parseScene({
      nodes: [{ type: 'group', name: 'g', children: [{ type: 'sphere', name: 's' }] }],
    })
    const group = doc.nodes[0]!
    if (group.type !== 'group') throw new Error('unreachable')
    expect(group.children[0]?.type).toBe('sphere')
  })

  it('reports an unknown node type at its line and column', () => {
    const text = JSON.stringify({ nodes: [{ type: 'box' }, { type: 'bocks' }] }, null, 2)
    try {
      parseSceneText(text, 'x.scene.json')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError)
      const [d] = (e as ValidationError).diagnostics
      expect(d?.path).toEqual(['nodes', 1, 'type'])
      expect(d?.line).toBeGreaterThan(1)
      expect(d?.column).toBeGreaterThan(0)
    }
  })

  it('rejects NaN and Infinity in a transform', () => {
    expect(() => parseScene({ nodes: [{ type: 'box', transform: { position: [0, Number.NaN, 0] } }] }))
      .toThrow(ValidationError)
  })

  it('suggests a near-miss spelling', () => {
    expect(suggest('sphrere', ['box', 'sphere', 'cylinder'])).toBe('sphere')
    expect(suggest('zzzzzzzz', ['box', 'sphere'])).toBeUndefined()
  })
})
