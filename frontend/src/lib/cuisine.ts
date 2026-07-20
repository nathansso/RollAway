import type { CuisineId } from '../fixtures/sampleMenus'
import type { MenuItem } from '../types/contract'

// #44: derive the cuisine tag from the menu the vendor already uploaded, so it
// isn't a dropdown they have to think about. Deliberately keyword-based rather
// than a model call: extraction has already happened by this point, the answer
// has to be instant, and a wrong guess is cheap (the field stays editable).
//
// Terms are chosen to be *distinctive* — a word that shows up across cuisines
// ("chicken", "rice", "wrap") earns nothing, because it would just add noise to
// every score equally.
const CUISINE_KEYWORDS: Record<CuisineId, readonly string[]> = {
  mexican: [
    'taco', 'burrito', 'quesadilla', 'horchata', 'al pastor', 'carnitas', 'salsa',
    'elote', 'churro', 'nachos', 'tamale', 'enchilada', 'chorizo', 'guacamole',
    'carne asada', 'agua fresca', 'tortilla', 'pico de gallo', 'birria',
  ],
  filipino: [
    'adobo', 'pancit', 'lumpia', 'ube', 'sisig', 'halo-halo', 'longganisa',
    'turon', 'kare-kare', 'bibingka', 'tocino', 'sinigang', 'lechon',
  ],
  chinese: [
    'dumpling', 'dan dan', 'scallion pancake', 'bao', 'chow mein', 'lo mein',
    'wonton', 'kung pao', 'mapo', 'fried rice', 'spring roll', 'char siu',
    'szechuan', 'sichuan', 'egg roll', 'potsticker',
  ],
  indian: [
    'tikka', 'masala', 'naan', 'samosa', 'lassi', 'curry', 'biryani', 'paneer',
    'chana', 'tandoori', 'dosa', 'vindaloo', 'saag', 'korma', 'pakora',
  ],
  mediterranean: [
    'shawarma', 'falafel', 'hummus', 'pita', 'gyro', 'tzatziki', 'kebab',
    'baklava', 'tabbouleh', 'dolma', 'souvlaki', 'feta', 'halloumi',
  ],
  american: [
    'cheeseburger', 'burger', 'fries', 'hot dog', 'bbq', 'mac and cheese',
    'chicken sandwich', 'wings', 'milkshake', 'grilled cheese', 'brisket',
    'coleslaw', 'onion rings', 'philly cheesesteak',
  ],
  coffee_dessert: [
    'latte', 'cold brew', 'espresso', 'cappuccino', 'cookie', 'brownie',
    'ice cream', 'cake', 'pastry', 'croissant', 'mocha', 'macchiato', 'scone',
    'muffin', 'donut', 'doughnut', 'gelato',
  ],
}

function countMatches(haystack: string, term: string): number {
  let count = 0
  let from = 0
  for (;;) {
    const at = haystack.indexOf(term, from)
    if (at === -1) return count
    // Only count a term that isn't glued to a larger word, so "bao" doesn't
    // match "baobab" and "cake" doesn't match "cupcake-adjacent" copy. Plural
    // and possessive forms still count, which is why the trailing side allows a
    // word character to follow only via the term's own plural.
    const before = haystack[at - 1] ?? ' '
    const after = haystack[at + term.length] ?? ' '
    const bounded = !/[a-z0-9]/.test(before) && (!/[a-z0-9]/.test(after) || after === 's')
    if (bounded) count += 1
    from = at + term.length
  }
}

/**
 * Best-guess cuisine for an extracted menu, or null when the menu doesn't look
 * like anything in particular. Null means "leave the vendor's choice alone" —
 * never guess, since a confident wrong tag is worse than no tag.
 */
export function inferCuisine(plainText: string, items: MenuItem[] = []): CuisineId | null {
  const haystack = [plainText, ...items.map((item) => item.name)].join('\n').toLowerCase()
  if (!haystack.trim()) return null

  const scores = (Object.entries(CUISINE_KEYWORDS) as Array<[CuisineId, readonly string[]]>)
    .map(([id, terms]) => ({
      id,
      score: terms.reduce((total, term) => total + countMatches(haystack, term), 0),
    }))
    .sort((a, b) => b.score - a.score)

  const [best, runnerUp] = scores
  if (!best || best.score === 0) return null
  // A tie is genuinely ambiguous (a burger stand that also sells cookies), so
  // decline rather than flip a coin.
  if (runnerUp && runnerUp.score === best.score) return null
  return best.id
}
