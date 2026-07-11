# Implementation: Event Opportunities and Menu Ingestion

## Scope

This branch owns event opportunities, vendor outreach drafts, and a dedicated Gradient AI menu ingestion agent. Permit PDF retrieval and completion belong to `feat/permit-pdf-completion`.

## Menu ingestion agent

- Accept menu PDFs, images, URLs, CSV files, and spreadsheets through a validated upload or URL boundary.
- Extract item names, descriptions, prices, currencies, cuisine categories, allergens, and dietary tags.
- Return versioned structured JSON with field-level confidence, warnings, and a review-required flag.
- Never invent missing prices, ingredients, or allergens.
- Let vendors correct the extraction and persist only confirmed menu data.
- Add evaluations for scans, missing prices, ambiguous allergens, unreadable inputs, and malicious document text.

## Event opportunities

- Add a Functions endpoint that discovers nearby events relevant to the vendor's selected location and dates.
- Normalize title, venue, coordinates, dates, deadline, organizer, contact channel, official source, retrieval time, fees, attendance, restrictions, and eligibility.
- Rank deterministically by distance, schedule, deadline, eligibility, demand, menu fit, and fees.
- Use AI only to explain verified results and draft outreach, not to decide eligibility.
- Require explicit vendor approval before opening or invoking a send action.
- Track draft, contacted, awaiting response, accepted, rejected, and expired states.

## Frontend

- Add menu import, extraction review, correction, and confirmation screens.
- Add event cards and details showing provenance, freshness, deadlines, ranking reasons, and contact status.
- Support loading, empty, stale, missing-contact, and expired states.
- Preserve fixture mode and add fixtures for every new contract.

## Shared contracts

- Publish versioned menu and event schemas in shared contract modules.
- Expose confirmed menu data through the vendor profile for use by the permit branch.
- Do not modify permit PDF schemas owned by the other branch.
- Coordinate any shared vendor-profile migration before either branch merges.

## Verification

- Unit tests for extraction adapters, validation, ranking, and state transitions.
- Contract tests across the frontend, Functions, and Gradient endpoint.
- Agent evaluations for extraction accuracy and unsupported claims.
- Browser tests for menu review, event discovery, outreach drafting, and approval gates.
- Update environment examples, deployment notes, and README documentation.

## Definition of done

All boundaries are typed and versioned, uncertainty and data freshness are visible, no outreach is sent automatically, and fixture and live builds pass their test suites.
