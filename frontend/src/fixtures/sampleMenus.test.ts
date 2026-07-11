import { describe, expect, it } from 'vitest'
import { SAMPLE_MENUS, sampleMenuText } from './sampleMenus'

describe('sample menus', () => {
  it('provides editable priced items for every supported cuisine', () => {
    expect(SAMPLE_MENUS.map((sample) => sample.id)).toEqual([
      'mexican',
      'filipino',
      'chinese',
      'indian',
      'mediterranean',
      'american',
      'coffee_dessert',
    ])

    for (const cuisine of SAMPLE_MENUS) {
      expect(cuisine.items.length).toBeGreaterThanOrEqual(3)
      expect(cuisine.items.length).toBeLessThanOrEqual(5)
      expect(sampleMenuText(cuisine.id)).toBe(cuisine.items.join('\n'))
      expect(sampleMenuText(cuisine.id)).toMatch(/\$\d/)
    }
  })
})
