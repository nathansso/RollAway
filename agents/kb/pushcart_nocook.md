---
source: checklist-pushcart-nocook
title: Permit Checklist — Pushcart (no-cook / prepackaged)
vendor_type: pushcart_nocook
agencies: [Treasurer, Public Health, Public Works]
updated: 2026-07-10
---

# Pushcart (no-cook) — Ordered Permit Checklist

A **no-cook pushcart** sells prepackaged or cold items (e.g. **ice cream**, bottled drinks,
prepackaged snacks) on the **sidewalk**. It is the lightest permit path: **no DMV** (not a
vehicle) and **no Fire permit** (no open flame, propane, or generator). Its defining constraint
is **wide sidewalk pedestrian clearance**, because it operates on the pedestrian path.

**Hidden clocks to surface:** documents current within the **90-day document window**; the
Public Works location application triggers a **30-day public notice**; decisions are appealable
within **15 days**.

1. **Treasurer & Tax Collector — register the business.** `ttx-cert`
2. **Public Health — health permit (no-cook tier) + commissary.** Lower-tier permit for
   prepackaged/cold handling; still needs a commissary/base and safe handling; no cook-line plan
   check. `sfdph-mff`
3. **Public Works — apply for the MFF permit (sidewalk location).** Triggers the **30-day public
   notice**. `sfpw-mff`
4. **Public Works — appeal window (15 days).** `sfpw-mff`
5. **Public Works — maintain wide sidewalk pedestrian clearance.** Leave the required
   unobstructed sidewalk path — minimum **10 ft** sidewalk width (6 ft clear path + 4 ft cart).
   Distinct legal basis (SF Public Works Code + ADA path-of-travel). Guide, not legal
   clearance. `sf-sidewalk-width`
6. **Public Works — operate within placement clearances.** Stay 75 ft from restaurant entrances,
   7 ft from hydrants, 500 ft from schools (school hours). Guide, not legal clearance.
   `dpw-182101`

> **No DMV step** (not a vehicle) and **no Fire permit** (no flame/propane/generator). If the
> cart later adds any heating element or propane, it becomes a `pushcart_cooking` and picks up
> the Fire permit.

```json
{
  "vendor_type": "pushcart_nocook",
  "steps": [
    { "order": 1, "agency": "Treasurer", "title": "Register the business", "detail": "Obtain/renew the SF Business Registration Certificate; keep it current.", "deadline_days": 90, "deadline_label": "90-day document window", "cite": "ttx-cert", "status": "todo" },
    { "order": 2, "agency": "Public Health", "title": "Health permit (no-cook tier) + commissary", "detail": "Lower-tier health permit for prepackaged/cold items; commissary/base agreement and safe-handling; no cook-line plan check.", "deadline_days": 90, "deadline_label": "90-day document window", "cite": "sfdph-mff", "status": "todo" },
    { "order": 3, "agency": "Public Works", "title": "Apply for the MFF permit (sidewalk location)", "detail": "Apply for your specific sidewalk location. Triggers a 30-day public notice; a hearing may be set if neighbors object.", "deadline_days": 30, "deadline_label": "30-day public notice", "cite": "sfpw-mff", "status": "todo" },
    { "order": 4, "agency": "Public Works", "title": "Appeal window", "detail": "The grant/deny decision can be appealed; the spot is not settled until this passes.", "deadline_days": 15, "deadline_label": "15-day appeal window", "cite": "sfpw-mff", "status": "todo" },
    { "order": 5, "agency": "Public Works", "title": "Maintain wide sidewalk pedestrian clearance", "detail": "Leave the required unobstructed sidewalk pedestrian path — minimum 10 ft sidewalk width (6 ft clear path + 4 ft cart). The in-app checker is a guide, not legal clearance.", "deadline_days": null, "deadline_label": null, "cite": "sf-sidewalk-width", "status": "todo" },
    { "order": 6, "agency": "Public Works", "title": "Operate within placement clearances", "detail": "Stay 75 ft from restaurant entrances, 7 ft from hydrants, and 500 ft from schools during school hours. The in-app checker is a guide, not legal clearance.", "deadline_days": null, "deadline_label": null, "cite": "dpw-182101", "status": "todo" }
  ]
}
```
