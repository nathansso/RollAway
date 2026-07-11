# Permit form fields — vendor-profile pre-fill map

Authored source of truth for the **vendor-profile fields Rollaway pre-fills into each official
form**, so a vendor keeps a viewable record of the paperwork they filed. This is the companion to
`FORMS.md`:

- `FORMS.md` owns the form **URL + agency** (verified agency-hosted PDFs only).
- `FORM_FIELDS.md` (this file) owns, per frozen `source` id, the **applicant-supplied fields** the
  app can pre-populate on that form, keyed by a `profile_key` from the vendor profile.

Rules (mirrored deterministically in `runtime/forms.mjs`):

1. A `filled_form` record is emitted **only** for a step whose `cite` resolves to a real, allowlisted
   `form_url` in `FORMS.md`. `SOURCE-NEEDED` / missing / off-domain forms get **no** `filled_form`
   (the step's `form_url` is already `null`).
2. Every value is copied **verbatim from the vendor's own supplied profile/context** — never
   invented. A field with no supplied value is returned with `value: null` and `status: "unknown"`.
3. These are the *applicant's own data fields* (a UI/record convenience), not a claim about the
   PDF's internal field names, and they carry **no citation** — same posture as `autofill_field`.
4. `profile_key` values reuse the vendor-profile vocabulary already used by `autofill_field`
   (`business_name`, `pinned_point`, `vehicle_plate`) plus the common applicant fields below.

`profile_key` vocabulary: `business_name`, `owner_name`, `pinned_point`, `vehicle_plate`,
`vendor_type`, `phone`, `email`. `pinned_point` is formatted as `"<lat>, <lng>"` from the request
context's pinned point; all others are copied as supplied strings.

| `source` id | `profile_key` | Field label |
|---|---|---|
| `sfpw-mff` | `business_name` | Business name |
| `sfpw-mff` | `owner_name` | Applicant / owner name |
| `sfpw-mff` | `vendor_type` | Mobile food facility type |
| `sfpw-mff` | `pinned_point` | Proposed location (lat, lng) |
| `sfpw-mff` | `phone` | Contact phone |
| `sfpw-mff` | `email` | Contact email |
| `sfdph-mff` | `business_name` | Business name |
| `sfdph-mff` | `owner_name` | Owner / operator name |
| `sfdph-mff` | `vendor_type` | Facility type |
| `sfdph-mff` | `phone` | Contact phone |
| `sfdph-mff` | `email` | Contact email |
| `sffd-permit` | `business_name` | Business name |
| `sffd-permit` | `owner_name` | Applicant name |
| `sffd-permit` | `phone` | Contact phone |
