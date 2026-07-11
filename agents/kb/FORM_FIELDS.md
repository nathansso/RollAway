# Permit form fields — vendor-profile pre-fill map

Authored source of truth for the **fields each official form asks the applicant for**, so Rollaway
can (a) determine what information a form needs, (b) pre-fill what the vendor already gave us, and
(c) produce a viewable/downloadable record of the paperwork. Companion to `FORMS.md`:

- `FORMS.md` owns the form **URL + agency** (verified agency-hosted PDFs only).
- `FORM_FIELDS.md` (this file) owns, per frozen `source` id, the **applicant-supplied fields** the
  form requires, each keyed to a `profile_key` from the vendor profile, with an input `type` and
  whether it is `required` on the form.

Rules (mirrored deterministically in `runtime/forms.mjs`, ingested by `POST /form_fill`):

1. A `filled_form` / form schema is emitted **only** for a step whose `cite` resolves to a real,
   allowlisted `form_url` in `FORMS.md`. `SOURCE-NEEDED` / missing / off-domain forms get **none**.
2. Every value is copied **verbatim from the vendor's own supplied profile/context** — never
   invented. A field with no supplied value is returned with `value: null` and `status: "unknown"`.
3. These are the *applicant's own data fields* (a UI/record convenience), not a claim about the
   PDF's internal field names, and they carry **no citation** — same posture as `autofill_field`.
   The field list here is authored from the verified form; the ingestion never hallucinates a field.
4. `profile_key` values reuse the vendor-profile vocabulary already used by `autofill_field`
   (`business_name`, `pinned_point`, `vehicle_plate`) plus the common applicant fields below.
5. `type` is one of `text`, `email`, `tel`, `date`, `number`, `select`, `textarea` (the input the
   fillable UI renders). `required` is `yes` for fields the form legally requires and `no` for
   optional ones; optional fields never block completion/export.

`profile_key` vocabulary: `business_name`, `owner_name`, `pinned_point`, `vehicle_plate`,
`vendor_type`, `phone`, `email`. `pinned_point` is formatted as `"<lat>, <lng>"` from the request
context's pinned point; all others are copied as supplied strings.

| `source` id | `profile_key` | Field label | `type` | `required` |
|---|---|---|---|---|
| `sfpw-mff` | `business_name` | Business name | text | yes |
| `sfpw-mff` | `owner_name` | Applicant / owner name | text | yes |
| `sfpw-mff` | `vendor_type` | Mobile food facility type | select | yes |
| `sfpw-mff` | `pinned_point` | Proposed location (lat, lng) | text | yes |
| `sfpw-mff` | `phone` | Contact phone | tel | yes |
| `sfpw-mff` | `email` | Contact email | email | no |
| `sfdph-mff` | `business_name` | Business name | text | yes |
| `sfdph-mff` | `owner_name` | Owner / operator name | text | yes |
| `sfdph-mff` | `vendor_type` | Facility type | select | yes |
| `sfdph-mff` | `phone` | Contact phone | tel | yes |
| `sfdph-mff` | `email` | Contact email | email | no |
| `sffd-permit` | `business_name` | Business name | text | yes |
| `sffd-permit` | `owner_name` | Applicant name | text | yes |
| `sffd-permit` | `phone` | Contact phone | tel | yes |
