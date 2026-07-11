---
source: sffd-permit
title: SF Fire Department — Mobile Food Facility Cooking / LPG Permit
agency: San Francisco Fire Department
doc_type: permit requirement
status: structural (authoritative trigger logic); exact permit names + fees SOURCE-NEEDED
updated: 2026-07-10
---

# SF Fire Department — Cooking / LPG Permit for MFFs

The Fire Department permit is **conditional on how the unit cooks**, and this is exactly where
vendor types diverge:

- **Open flame / cooking on board** (truck, trailer, pushcart_cooking) → **fire permit
  required**. Covers open flame, cooking appliances, **LPG (propane)** storage/use, and on-board
  **generators**. Typically requires a fire inspection, a **fire extinguisher**, and (for
  grease-producing cooking) a **fire-suppression hood** on trucks/trailers.
- **No-cook / prepackaged only** (pushcart_nocook) → **no fire permit** (no open flame, no LPG,
  no generator). If a no-cook cart later adds any heating element/propane, it moves into the
  permit-required category.

## What the fire permit covers (`cite: sffd-permit`)

1. **Fire permit application** (only if cooking / flame / LPG / generator).
2. **LPG / propane** storage and appliance compliance.
3. **Fire-suppression system** (hood) for grease-producing cooking on trucks/trailers.
4. **Fire extinguisher** on board and **fire inspection** before operating.

This step enters the checklist under the **Fire** agency for `truck`, `trailer`, and
`pushcart_cooking`, and is **omitted** for `pushcart_nocook`.

<!-- SOURCE-NEEDED
  what: exact SFFD permit name(s), inspection requirements, extinguisher/hood specs, and fees
  fields required:
    - the SFFD permit title/number for MFF cooking operations
    - LPG quantity thresholds that trigger the permit
    - suppression-hood requirement threshold (grease-producing cooking)
    - fire permit fee(s)
  where to fetch: SF Fire Department permit / fire code pages + fee schedule
  rule: the "cooking ⇒ fire permit; no-cook ⇒ none" LOGIC is authoritative; names/specs/fees TBC.
-->
