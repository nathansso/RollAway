// Single source of truth for the marketing landing copy.
// Kept in one file so the headline / CTA are trivial to edit without touching layout.

/** Where the primary CTA sends visitors — the map app entry point. */
export const APP_PATH = '/app'

/** The one primary call to action, repeated verbatim everywhere it appears. */
export const CTA_LABEL = 'Find your spot'

export const HERO = {
  eyebrow: 'For San Francisco food trucks & carts',
  headline:
    'Find the best block to park your food truck — and get permitted to be there.',
  subhead:
    'Rollaway scores real San Francisco blocks on foot traffic, competition, and legality — then builds the exact permit checklist to set up there.',
  tagline: 'Get your business rolling',
  trust: 'No sign-up — your profile stays on your device.',
} as const

/** Honest proof only: real data sources and real numbers, no fabricated logos or testimonials. */
export const PROOF = {
  builtOn: 'Built on DigitalOcean Gradient',
  poweredBy: 'Powered by SF open data, Bay Wheels & Google Places',
  stats: [
    {
      value: '560,299',
      label: 'real Bay Wheels trips scored for the foot-traffic signal',
    },
    {
      value: '4',
      label: 'city agencies mapped into one permit checklist',
    },
    {
      value: '3',
      label: 'live public data sources — legality checked, not guessed',
    },
  ],
} as const

export const FEATURES = [
  {
    icon: 'footTraffic',
    title: 'Set up where the customers already are',
    body: 'Rollaway ranks blocks by real foot-traffic signal and how crowded the competition is, so you skip the dead corners. Scores are estimates from public data — not a promise — and every block shows the numbers behind it.',
  },
  {
    icon: 'shield',
    title: "Only see blocks you're allowed to work",
    body: 'Each spot is measured against hydrant, restaurant, and school clearances and checked for active street closures. Placements that fail are filtered out before you ever drive there.',
  },
  {
    icon: 'permit',
    title: 'Get permitted without the four-agency maze',
    body: 'One EasyApply checklist spans Public Health, Fire, Public Works, and the Treasurer & Tax Collector — with the forms, fees, and deadlines in the order you actually need them.',
  },
] as const

export const CLOSING = {
  headline: 'Get your business rolling.',
  subhead:
    'Set your menu and your window, and Rollaway does the rest — ranked San Francisco blocks and a permit path built for your truck.',
  micro: 'Opens straight into the app. No account, no paywall.',
} as const

export const FOOTER = {
  tagline:
    'Location intelligence and permit planning for San Francisco mobile food vendors.',
  credits:
    'Built on DigitalOcean Gradient. Data from SF open data (DataSF), Bay Wheels, and Google Places.',
  disclaimer:
    'Scores and travel times are estimates. Always verify curb signs and permit rules before operating.',
} as const
