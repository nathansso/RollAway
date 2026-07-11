---
source: clearance-ref
title: Clearance Requirements & Fee Schedule — quick reference
agency: San Francisco Public Works (derived from DPW Order No. 182,101)
doc_type: reference table
status: distances authoritative (contract-pinned); fees SOURCE-NEEDED
updated: 2026-07-10
---

# Clearance Requirements & Fees — Quick Reference

Derived, at-a-glance table. **Every distance row is set by `dpw-182101`** (DPW Order No.
182,101) and cites it — this doc does not create new numbers, it collects the ones the geometry
Function checks so a reader/agent can see them in one place.

## Distances the geometry check enforces (frozen by `docs/CONTRACTS.md §B`)

| Rule | Required | Vendor types affected | `cite` |
|---|---|---|---|
| From restaurant entrance | **75 ft** | truck, trailer, pushcart_cooking, pushcart_nocook | `dpw-182101` |
| From fire hydrant | **7 ft** | all | `dpw-182101` |
| From school (school hours) | **500 ft** | all | `dpw-182101` |
| Minimum sidewalk width (6 ft path + 4 ft cart) | **10 ft** | `pushcart_cooking`, `pushcart_nocook` only (sidewalk ops) | `sf-sidewalk-width` |
| Between two MFFs / claimed spots | `SOURCE-NEEDED` ft | all | `dpw-182101` |

> The clearance checker is a **guide**, not legal clearance. It explains the published
> distances; it does not grant a permit or guarantee approval.

## Why pushcarts care about sidewalk clearance and trucks care about the 75 ft rule

- **Trucks / trailers** operate from the **curb lane / street**. Their binding constraints are
  the 75 ft restaurant rule, the 7 ft hydrant rule, the 500 ft school rule, and no-parking /
  street-closure conflicts.
- **Pushcarts** operate **on the sidewalk**. The **wide sidewalk pedestrian clearance** is their
  defining constraint (they must leave a clear accessible path), and they are **not** motor
  vehicles — so **no DMV / vehicle registration** applies to them. This is the key difference the
  per-vendor-type checklists encode.

## Fee schedule

Fees are set by SF Public Works (permit application/issuance) and the other agencies (health,
fire, business registration). Specific dollar amounts must be confirmed against the current
published schedule — they are **not** invented here.

<!-- SOURCE-NEEDED
  what: current MFF fee schedule (dollar amounts)
  fields required:
    - Public Works MFF permit application fee
    - Public Works MFF annual permit / issuance fee
    - Public Works public-notice / posting fee (if separate)
    - Public Health MFF permit / plan-check fee
    - Fire Department permit fee (cooking / LPG)
    - Treasurer business registration fee (scaled by receipts)
  where to fetch:
    - SF Public Works Mobile Food Facility permit page (fee table)
    - SFDPH environmental health fee schedule
    - SF Fire Department permit fee schedule
    - SF Treasurer & Tax Collector business registration
  rule: leave as ranges/"SOURCE-NEEDED" until confirmed; never quote a specific fee we can't cite.
-->

Until filled, agents state fees qualitatively ("Public Works charges an application fee and an
annual permit fee; exact amounts are on the current SF Public Works fee schedule") and cite
`sfpw-fees`, rather than quoting a number.
