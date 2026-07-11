import type { ComponentType, SVGProps } from 'react'
import BrandMark from '../common/BrandMark'
import HeroMock from './HeroMock'
import {
  ChevronIcon,
  FootTrafficIcon,
  PermitIcon,
  RouteIcon,
  ShieldIcon,
} from '../common/Icons'
import {
  APP_PATH,
  CLOSING,
  CTA_LABEL,
  FEATURES,
  FOOTER,
  HERO,
  PROOF,
} from './copy'

const FEATURE_ICON: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  footTraffic: FootTrafficIcon,
  shield: ShieldIcon,
  permit: PermitIcon,
}

const STEPS = [
  {
    title: 'Tell us about your truck',
    body: 'Your menu, price point, hours, and where you start the day. Stored on your device — no account.',
  },
  {
    title: 'See blocks ranked good, check, or avoid',
    body: 'Legal, low-competition spots first, each with the foot-traffic and clearance reasons behind the score.',
  },
  {
    title: 'Work one permit checklist',
    body: 'Every task across the four SF agencies, in order, with forms, fees, and deadlines.',
  },
] as const

function PrimaryCta({ className = '' }: { className?: string }) {
  return (
    <a href={APP_PATH} className={`primary-button ${className}`}>
      {CTA_LABEL}
      <RouteIcon className="h-4 w-4" aria-hidden="true" />
    </a>
  )
}

export default function LandingPage() {
  return (
    <div className="landing-root">
      <a href="#hero-heading" className="skip-link">
        Skip to main content
      </a>

      {/* Top navigation */}
      <header className="landing-nav">
        <div className="landing-shell flex items-center justify-between gap-4 py-3">
          <BrandMark />
          <PrimaryCta className="landing-nav__cta" />
        </div>
      </header>

      <main>
        {/* Hero */}
        <section
          className="landing-hero"
          aria-labelledby="hero-heading"
        >
          <div className="landing-shell grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                {HERO.eyebrow}
              </p>
              <h1
                id="hero-heading"
                className="mt-4 font-display text-4xl font-bold leading-[1.06] tracking-[-0.03em] text-foreground sm:text-5xl lg:text-[3.4rem]"
              >
                Find the best block to park your food truck —{' '}
                <span className="text-primary">and get permitted to be there.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
                {HERO.subhead}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
                <PrimaryCta className="landing-cta--lg" />
                <a href="#how" className="landing-textlink">
                  See how it works
                  <ChevronIcon className="h-4 w-4 rotate-90" aria-hidden="true" />
                </a>
              </div>
              <p className="mt-4 text-sm font-medium text-muted-foreground">
                {HERO.trust}
              </p>
            </div>

            <div className="landing-hero__visual">
              <HeroMock />
              <p className="landing-hero__caption">{HERO.tagline}</p>
            </div>
          </div>
        </section>

        {/* Honest proof strip */}
        <section className="landing-section" aria-label="What Rollaway is built on">
          <div className="landing-shell">
            <div className="flex flex-wrap justify-center gap-3">
              <span className="source-chip">{PROOF.builtOn}</span>
              <span className="source-chip">{PROOF.poweredBy}</span>
            </div>
            <dl className="landing-stats">
              {PROOF.stats.map((stat) => (
                <div key={stat.value} className="landing-stat">
                  <dt className="font-display text-4xl font-bold tracking-[-0.02em] text-primary">
                    {stat.value}
                  </dt>
                  <dd className="mt-2 text-sm leading-6 text-muted-foreground">
                    {stat.label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Benefit sections */}
        <section id="features" className="landing-section" aria-labelledby="features-heading">
          <div className="landing-shell">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                Why vendors use it
              </p>
              <h2
                id="features-heading"
                className="mt-3 font-display text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl"
              >
                Three fewer things to guess about your next shift.
              </h2>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {FEATURES.map((feature) => {
                const Icon = FEATURE_ICON[feature.icon]
                return (
                  <article key={feature.title} className="landing-card">
                    <span className="fact-icon" aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 font-display text-xl font-bold text-foreground">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {feature.body}
                    </p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="landing-section" aria-labelledby="how-heading">
          <div className="landing-shell">
            <h2
              id="how-heading"
              className="max-w-2xl font-display text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl"
            >
              From parked to permitted in three steps.
            </h2>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="landing-step">
                  <span className="agency-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 font-display text-lg font-bold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="landing-section" aria-labelledby="closing-heading">
          <div className="landing-shell">
            <div className="landing-closing">
              <h2
                id="closing-heading"
                className="font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl"
              >
                {CLOSING.headline}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-white/80">
                {CLOSING.subhead}
              </p>
              <div className="mt-8 flex justify-center">
                <PrimaryCta className="landing-cta--lg" />
              </div>
              <p className="mt-4 text-sm text-white/70">{CLOSING.micro}</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-shell flex flex-col gap-4 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <BrandMark />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {FOOTER.tagline}
            </p>
          </div>
          <div className="max-w-md text-sm leading-6 text-muted-foreground sm:text-right">
            <p>{FOOTER.credits}</p>
            <p className="mt-3 text-xs leading-5">{FOOTER.disclaimer}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
