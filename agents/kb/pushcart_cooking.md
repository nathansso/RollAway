---
source: checklist-pushcart-cooking
title: Permit Checklist — Pushcart (cooking)
vendor_type: pushcart_cooking
agencies: [Treasurer, Public Health, Fire, Public Works]
updated: 2026-07-10
---

# Pushcart (cooking) — Ordered Permit Checklist

A **cooking pushcart** heats/cooks food (often on propane) but operates **on the sidewalk** and
is **not a motor vehicle**. Compared with a truck it **drops the DMV step entirely** but **keeps
the Fire permit** (propane / open flame) and adds an emphasis on **wide sidewalk pedestrian
clearance**, since it sits on the pedestrian path.

**Hidden clocks to surface:** documents current within the **90-day document window**; the
Public Works location application triggers a **30-day public notice**; decisions are appealable
within **15 days**.

1. **Treasurer & Tax Collector — register the business.** `ttx-cert`
2. **Public Health — health permit + plan review + commissary.** Cooking pushcart gets plan
   review for its heating/cooking setup plus a commissary/base agreement and operator
   certification. `sfdph-mff`
3. **Fire — cooking / LPG permit.** Propane storage/use and open-flame compliance; fire
   extinguisher; inspection. (No vehicle, but the flame still needs a fire permit.) `sffd-permit`
4. **Public Works — apply for the MFF permit (sidewalk location).** Triggers the **30-day public
   notice**. `sfpw-mff`
5. **Public Works — appeal window (15 days).** `sfpw-mff`
6. **Public Works — maintain wide sidewalk pedestrian clearance.** Leave the required
   unobstructed sidewalk path — minimum **10 ft** sidewalk width (6 ft clear path + 4 ft cart).
   Distinct legal basis (SF Public Works Code + ADA path-of-travel). Guide, not legal
   clearance. `sf-sidewalk-width`
7. **Public Works — operate within placement clearances.** Stay 75 ft from restaurant entrances,
   7 ft from hydrants, 500 ft from schools (school hours). Guide, not legal clearance.
   `dpw-182101`

> **No DMV step** — a pushcart is not a registrable vehicle.

```json
{
  "vendor_type": "pushcart_cooking",
  "steps": [
    { "order": 1, "agency": "Treasurer", "title": "Register the business", "detail": "Obtain/renew the SF Business Registration Certificate; keep it current.", "deadline_days": 90, "deadline_label": "90-day document window", "cite": "ttx-cert", "autofill_field": "business_name", "status": "todo" },
    { "order": 2, "agency": "Public Health", "title": "Health permit + plan review + commissary", "detail": "Plan review of the heating/cooking setup, commissary/base agreement, operator food-safety certification, and inspection.", "deadline_days": 90, "deadline_label": "90-day document window", "cite": "sfdph-mff", "autofill_field": "business_name", "status": "todo" },
    { "order": 3, "agency": "Fire", "title": "Cooking / LPG fire permit", "detail": "Propane (LPG) storage/use and open-flame compliance; fire extinguisher; inspection. Required because the cart cooks with flame even though it is not a vehicle.", "deadline_days": 90, "deadline_label": "90-day document window", "cite": "sffd-permit", "status": "todo" },
    { "order": 4, "agency": "Public Works", "title": "Apply for the MFF permit (sidewalk location)", "detail": "Apply for your specific sidewalk location. Triggers a 30-day public notice; a hearing may be set if neighbors object.", "deadline_days": 30, "deadline_label": "30-day public notice", "cite": "sfpw-mff", "autofill_field": "pinned_point", "status": "todo" },
    { "order": 5, "agency": "Public Works", "title": "Appeal window", "detail": "The grant/deny decision can be appealed; the spot is not settled until this passes.", "deadline_days": 15, "deadline_label": "15-day appeal window", "cite": "sfpw-mff", "status": "todo" },
    { "order": 6, "agency": "Public Works", "title": "Maintain wide sidewalk pedestrian clearance", "detail": "Leave the required unobstructed sidewalk pedestrian path — minimum 10 ft sidewalk width (6 ft clear path + 4 ft cart). The in-app checker is a guide, not legal clearance.", "deadline_days": null, "deadline_label": null, "cite": "sf-sidewalk-width", "status": "todo" },
    { "order": 7, "agency": "Public Works", "title": "Operate within placement clearances", "detail": "Stay 75 ft from restaurant entrances, 7 ft from hydrants, and 500 ft from schools during school hours. The in-app checker is a guide, not legal clearance.", "deadline_days": null, "deadline_label": null, "cite": "dpw-182101", "status": "todo" }
  ]
}
```
