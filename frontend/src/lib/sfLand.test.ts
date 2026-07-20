import { describe, expect, it } from 'vitest'
import { isOnSanFranciscoLand } from './sfLand'
import { isWithinSanFrancisco } from './sfBounds'

describe('San Francisco landmask', () => {
  it.each([
    ['Ferry Building', 37.7955, -122.3937],
    ['2nd & Howard', 37.7869, -122.3982],
    ['Financial District', 37.7915, -122.4005],
    ['Civic Center', 37.779, -122.4177],
    ['Mission', 37.7599, -122.4148],
    ['Golden Gate Park', 37.7694, -122.4862],
    ['Oracle Park', 37.7786, -122.3893],
    ['Outer Sunset', 37.7538, -122.4936],
    ['Bayview', 37.7299, -122.3907],
  ])('puts %s on land', (_name, lat, lng) => {
    expect(isOnSanFranciscoLand({ lat, lng })).toBe(true)
  })

  // The whole point: these all sit inside the SF *rectangle*, which is why a
  // bbox check alone was dropping pins into open water.
  it.each([
    ['the Bay off the Ferry Building', 37.7955, -122.3835],
    ['the Bay off Rincon', 37.7905, -122.382],
    ['the Bay north of Pier 39', 37.8175, -122.4055],
    ['Treasure Island', 37.8235, -122.37],
    ['the Pacific off Ocean Beach', 37.7601, -122.5215],
    ['the Bay off Mission Bay', 37.7705, -122.376],
    // Seen in-browser as pins floating between the piers: inside the SF box,
    // east of the seawall, open water.
    ['open water off Pier 15', 37.7998, -122.3961],
    ['open water off Pier 7', 37.7976, -122.3949],
  ])('keeps %s off land', (_name, lat, lng) => {
    expect(isWithinSanFrancisco({ lat, lng })).toBe(true)
    expect(isOnSanFranciscoLand({ lat, lng })).toBe(false)
  })
})
