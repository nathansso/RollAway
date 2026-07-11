# Rollaway guided map flow

## Goal

Replace the current always-visible map shell with a clear, staged journey:

1. collect the vendor profile,
2. collect session timing and live location,
3. show a branded full-screen loading transition,
4. reveal an interactive Mapbox recommendation map, and
5. generate permit guidance from a separate top-level page.

The interface remains mobile-first, fixture-capable, accessible, and useful if live
recommendation services are unavailable.

## Geographic scope

Rollaway supports the City and County of San Francisco only. Recommendation searches,
sample locations, vendor data, closure data, map framing, and permit guidance are all
SF-specific. The map starts over San Francisco and uses city bounds to prevent the
product from implying support for Oakland, Berkeley, San Jose, or other jurisdictions.

Live geolocation outside San Francisco may still be displayed for transparency, but
the session setup explains that recommendations are limited to San Francisco and asks
the user to choose an SF home base or use the SoMa demo origin. Permit guidance remains
explicitly tied to San Francisco agencies and rules.

## Product flow

### 1. Vendor profile

First launch opens directly on a full-page form. It collects vendor type, cuisine,
menu, home base, maximum travel distance or time, operating windows, permit status,
and contact details. The existing local-only profile remains editable and persists
defensively.

Cuisine becomes an explicit selection. Choosing a cuisine offers a matching sample
menu that can populate the editable menu field for demos and tests. Users may still
paste or upload their own menu. Sample data is a committed non-sensitive fixture,
not generated remotely.

The header brand is displayed as the single word **Rollaway**, without adjacent
descriptor text.

### 2. Session setup

After profile completion, a dedicated setup screen asks when the vendor wants to
operate and requests browser geolocation through an explicit action. Presets and the
custom date/time window remain available. Permission denial keeps the SoMa fallback
and clearly labels it as approximate.

The primary action is **Find places to roll**. It is enabled once the session window
is valid and location resolution has completed or fallen back.

### 3. Recommendation loading

Submitting session setup opens a viewport-covering orange loading screen. The rolling
truck SVG is centered, with the slogan **“Get your business rolling.”** directly below
it and an accessible live status label. The screen covers navigation and prior content.

Reduced-motion mode keeps the truck visible while disabling continuous movement.
Errors replace the loader with a recovery action rather than returning a blank screen.

### 4. Interactive map results

The results screen uses Mapbox whenever a public token is configured. Fixture mode no
longer disables Mapbox; fixture mode controls business-data requests only. The public
Mapbox token is read from gitignored `.env.local` and is never committed.

The map initially fits the live/fallback origin and all recommendations within San
Francisco. It supports pan, zoom, keyboard controls, geolocation recentering, ranked
recommendation markers, muted vendor markers, closure geometry, and selectable
recommendation cards. Selecting a marker or card opens the existing structured Good to
Know details.

Each recommendation displays estimated driving time and distance. Fixture mode derives
stable estimates from coordinates. Live routing can be added later without making the
demo depend on another API. The map retains an improved data-driven fallback if Mapbox
or tiles fail.

### 5. Permits page

Permits remains a separate top-level destination. Before checklist data exists, the
page shows a clear **Build my permit checklist** action and short explanation. Pressing
it opens the same orange full-screen truck loader, then reveals the personalized
checklist and EasyApply review actions.

The map and permits pages keep predictable navigation after the initial guided flow.

## Architecture

The Zustand store gains an explicit app phase:

- `profile`
- `session`
- `loading_recommendations`
- `map`
- `loading_permits`

Existing profile, session, recommendation, and permit state remain the source of truth.
Phase transitions occur only through store actions so asynchronous results cannot
reveal the wrong screen. Loading uses one reusable full-screen component with context-
specific accessible labels.

Mapbox rendering remains isolated in `MapView`. Fixture adaptation remains isolated in
`apiClient`. Sample cuisine/menu data lives in a typed fixture module and is consumed by
the profile form and tests.

## Error handling and privacy

- Only the public Mapbox token is needed for this frontend flow.
- Tokens and other credentials are never added to tracked files.
- Geolocation requires an explicit browser permission action.
- Recommendation and permit failures expose retry and edit-input actions.
- Stale asynchronous results remain invalidated when profile, time, or location changes.
- The app preserves a usable fallback when Mapbox cannot initialize.

## Accessibility and responsive behavior

- Full-screen transitions move focus to their status heading.
- Loading status is announced without repeatedly interrupting screen readers.
- All map-adjacent controls retain at least 44-pixel targets.
- Status is conveyed by icon and text, not color alone.
- Safe-area padding applies to every staged screen.
- Forms retain visible labels, inline errors, 16-pixel controls, and keyboard order.
- Reduced-motion preferences disable continuous truck, wheel, and dust animations.

## Verification

Automated browser coverage will verify:

- first launch begins on the profile form;
- cuisine selection can populate a sample menu;
- profile completion advances to session setup;
- granted and denied geolocation paths;
- outside-SF location messaging and fallback behavior;
- recommendation submission shows an orange viewport-covering loader;
- Mapbox initializes within San Francisco bounds when configured and markers/cards
  remain interactive;
- travel estimates appear for recommendations;
- permits is a separate page with an explicit generation button and full-screen loader;
- fixture business data causes no business-API requests;
- reduced-motion and production offline fallback remain usable.

Unit tests will cover the sample-menu dataset, app-phase transitions, fixture travel
estimates, and stale-request protection. Lint, TypeScript build, unit tests, mobile E2E,
and production PWA tests must pass before completion.
