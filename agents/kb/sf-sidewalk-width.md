---
source: sf-sidewalk-width
title: Minimum Sidewalk Width / Pedestrian Path-of-Travel (sidewalk MFFs — pushcarts)
agency: San Francisco Public Works (SF Public Works Code) + ADA accessible path-of-travel
doc_type: accessibility / path-of-travel requirement
status: framework authoritative (6 ft path + 4 ft cart = 10 ft); exact PW Code § SOURCE-NEEDED
updated: 2026-07-11
applies_to: [pushcart_cooking, pushcart_nocook]
---

# Minimum Sidewalk Width for Sidewalk-Operating MFFs (pushcarts)

A pushcart operates **on the sidewalk**, so it must not narrow the pedestrian path below the
minimum accessible **path-of-travel**. This is a separate legal basis from the MFF *placement
distances* in DPW Order No. 182,101 (`dpw-182101`) — it comes from the **SF Public Works Code**
and the **ADA accessible path-of-travel** requirement, so it carries its own citation id
(`sf-sidewalk-width`), not `dpw-182101`.

> Why a distinct id: `dpw-182101` covers the three placement distances (75 ft restaurant, 7 ft
> hydrant, 500 ft school). The sidewalk clear-width / path-of-travel rule is grounded in the SF
> Public Works Code + ADA, not in the Order's distance provisions, so it is registered separately
> (a `cite` id must resolve to a source document; see `SOURCES.md`).

## The rule (framework — authoritative composition)

| Component | Width | Basis |
|---|---|---|
| Clear pedestrian path (must stay unobstructed) | **6 ft** | SF path-of-travel standard (ADA minimum is 4 ft; SF requires a wider clear path) |
| Cart footprint (space the pushcart occupies) | **4 ft** | operational |
| **Minimum sidewalk width to operate** | **10 ft** | 6 ft path + 4 ft cart |

A pushcart may only set up where the sidewalk is at least **10 ft** wide, so that a **6 ft** clear
pedestrian path remains after the **4 ft** cart footprint. On a narrower sidewalk it cannot
operate without blocking the accessible path.

- **Applies to:** `pushcart_cooking`, `pushcart_nocook` (sidewalk operations).
- **Does NOT apply to:** `truck`, `trailer` (they operate from the curb lane, not the sidewalk) —
  which is why `check_clearance` returns this 4th row **only** for the two pushcart types.

## Computation input (NOT the citation)

Person 3's `check_clearance` computes the actual sidewalk width at a point from the SF
**sidewalk-widths dataset `4g86-grxu`**. That dataset is the *computation input*, not the legal
citation — the `cite` for this row is `sf-sidewalk-width` (this doc), which states the legal
basis.

<!-- SOURCE-NEEDED
  what: the exact legal citation for SF's minimum sidewalk clear-width / path-of-travel rule
  fields required:
    - SF Public Works Code section establishing the minimum clear pedestrian path width
    - the exact required clear-path figure (confirm the 6 ft SF standard vs the 4 ft ADA minimum)
    - any MFF-specific sidewalk-width provision (some cities set a wider path for vending)
  where to fetch:
    - SF Public Works Code (path-of-travel / sidewalk obstruction provisions)
    - ADA Standards for Accessible Design (accessible route clear width)
    - SF Public Works Mobile Food Facility permit page (sidewalk operating conditions)
  rule: do NOT invent a section number. The 6 ft + 4 ft = 10 ft FRAMEWORK is the computation
        basis P3 uses; the exact PW Code § and verbatim wording must be filled from the source.
-->

## Citation label

```json
{ "label": "SF sidewalk path-of-travel — 10 ft min sidewalk width (6 ft path + 4 ft cart)",
  "source": "sf-sidewalk-width",
  "quote": "A sidewalk mobile food facility must leave a minimum 6 ft clear pedestrian path; with a 4 ft cart footprint this requires a sidewalk at least 10 ft wide." }
```

The **framework** (6 ft path + 4 ft cart = 10 ft) is authoritative as the computation basis; the
exact SF Public Works Code section and verbatim wording are `SOURCE-NEEDED`.
