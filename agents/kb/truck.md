---
source: checklist-truck
title: Permit Checklist — Food Truck
vendor_type: truck
agencies: [Treasurer, Public Health, Fire, DMV, Public Works]
updated: 2026-07-10
---

# Food Truck — Ordered Permit Checklist

A **truck** is a motor vehicle that cooks on board and operates from the **curb lane / street**.
It therefore needs the full stack: business registration, a health permit **with plan review**,
a **fire** permit (cooking / LPG), **DMV** vehicle registration, and the Public Works MFF permit
for its location and schedule — then it must operate within the placement clearances.

**Hidden clocks to surface:** keep every supporting document current inside the **90-day
document window**; the Public Works location application triggers a **30-day public notice**; a
decision can be appealed within **15 days**.

1. **Treasurer & Tax Collector — register the business.** Get/renew the Business Registration
   Certificate; keep it current within the 90-day document window. `ttx-cert`
2. **Public Health — health permit + plan review + commissary.** Full plan review of the cook
   line; commissary/base agreement; operator food-safety certification; unit inspection.
   `sfdph-mff`
3. **Fire — cooking / LPG permit.** Open-flame + propane + generator compliance, fire
   extinguisher, and a fire-suppression hood for grease-producing cooking; fire inspection.
   `sffd-permit`
4. **California DMV — register the vehicle.** Current vehicle registration; proof feeds the
   Public Works application. `ca-dmv`
5. **Public Works — apply for the MFF permit (location + schedule).** Triggers the **30-day
   public notice**; a hearing may be set if there are objections. `sfpw-mff`
6. **Public Works — appeal window.** The grant/deny decision is subject to a **15-day appeal
   window** before the spot is settled. `sfpw-mff`
7. **Public Works — operate within placement clearances.** 75 ft from restaurant entrances, 7 ft
   from hydrants, 500 ft from schools during school hours (the in-app checker is a guide, not
   legal clearance). `dpw-182101`

```json
{
  "vendor_type": "truck",
  "steps": [
    { "order": 1, "agency": "Treasurer", "title": "Register the business", "detail": "Obtain/renew the SF Business Registration Certificate; keep it current.", "deadline_days": 90, "deadline_label": "90-day document window", "cite": "ttx-cert", "status": "todo" },
    { "order": 2, "agency": "Public Health", "title": "Health permit + plan review + commissary", "detail": "Full plan review of the cook line, commissary/base agreement, operator food-safety certification, and unit inspection.", "deadline_days": 90, "deadline_label": "90-day document window", "cite": "sfdph-mff", "status": "todo" },
    { "order": 3, "agency": "Fire", "title": "Cooking / LPG fire permit", "detail": "Open-flame, propane (LPG) and generator compliance; fire extinguisher; suppression hood for grease-producing cooking; fire inspection.", "deadline_days": 90, "deadline_label": "90-day document window", "cite": "sffd-permit", "status": "todo" },
    { "order": 4, "agency": "DMV", "title": "Register the vehicle with the California DMV", "detail": "Current vehicle registration; proof of registration supports the Public Works application.", "deadline_days": 90, "deadline_label": "90-day document window", "cite": "ca-dmv", "status": "todo" },
    { "order": 5, "agency": "Public Works", "title": "Apply for the MFF permit (location + schedule)", "detail": "Apply for your specific location and schedule. Triggers a 30-day public notice; a hearing may be set if neighbors object.", "deadline_days": 30, "deadline_label": "30-day public notice", "cite": "sfpw-mff", "status": "todo" },
    { "order": 6, "agency": "Public Works", "title": "Appeal window", "detail": "The grant/deny decision can be appealed; the spot is not settled until this passes.", "deadline_days": 15, "deadline_label": "15-day appeal window", "cite": "sfpw-mff", "status": "todo" },
    { "order": 7, "agency": "Public Works", "title": "Operate within placement clearances", "detail": "Stay 75 ft from restaurant entrances, 7 ft from hydrants, and 500 ft from schools during school hours. The in-app checker is a guide, not legal clearance.", "deadline_days": null, "deadline_label": null, "cite": "dpw-182101", "status": "todo" }
  ]
}
```
