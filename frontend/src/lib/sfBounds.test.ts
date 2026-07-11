import { describe, expect, it } from 'vitest'
import { SF_BOUNDS, isWithinSanFrancisco } from './sfBounds'

describe('San Francisco bounds', () => {
  it('accepts SoMa and rejects Oakland and San Jose', () => {
    expect(isWithinSanFrancisco({ lat: 37.7793, lng: -122.4013 })).toBe(true)
    expect(isWithinSanFrancisco({ lat: 37.8044, lng: -122.2712 })).toBe(false)
    expect(isWithinSanFrancisco({ lat: 37.3382, lng: -121.8863 })).toBe(false)
  })

  it('includes both bounding-box edges', () => {
    expect(isWithinSanFrancisco(SF_BOUNDS.southwest)).toBe(true)
    expect(isWithinSanFrancisco(SF_BOUNDS.northeast)).toBe(true)
  })
})
