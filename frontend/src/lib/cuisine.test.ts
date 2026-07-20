import { describe, expect, it } from 'vitest'
import { inferCuisine } from './cuisine'
import { SAMPLE_MENUS } from '../fixtures/sampleMenus'

describe('inferCuisine', () => {
  // The strongest available evidence that the keyword sets actually separate:
  // every built-in sample menu must classify as itself.
  it.each(SAMPLE_MENUS.map((sample) => [sample.id, sample.items.join('\n')] as const))(
    'classifies the %s sample menu as itself',
    (id, text) => {
      expect(inferCuisine(text)).toBe(id)
    },
  )

  it('reads menu item names as well as the raw text', () => {
    expect(
      inferCuisine('', [
        { name: 'Al pastor taco', price: 5 },
        { name: 'Horchata', price: 4 },
      ]),
    ).toBe('mexican')
  })

  it('declines when the menu looks like nothing in particular', () => {
    expect(inferCuisine('Daily special $10\nSoup $6\nSide salad $4')).toBeNull()
    expect(inferCuisine('')).toBeNull()
    expect(inferCuisine('   ')).toBeNull()
  })

  it('declines on a tie rather than flipping a coin', () => {
    // One burger, one cookie: a snack cart, not a verdict.
    expect(inferCuisine('Cheeseburger $12\nCookie $3')).toBeNull()
  })

  it('picks the dominant cuisine when a menu straddles two', () => {
    // A burger joint that also sells one dessert is still a burger joint.
    expect(inferCuisine('Cheeseburger $14\nSeasoned fries $6\nWings $11\nBrownie $4')).toBe(
      'american',
    )
  })

  it('does not match a term glued inside a larger word', () => {
    // "bao" inside "baobab", not a Chinese menu.
    expect(inferCuisine('Baobab smoothie $8')).toBeNull()
  })

  it('still matches plurals', () => {
    expect(inferCuisine('Pork dumplings $9\nPotstickers $8')).toBe('chinese')
  })
})
