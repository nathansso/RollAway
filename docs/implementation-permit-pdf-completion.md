# Implementation: Official Permit PDF Completion

## Scope

This branch owns the one-time acquisition of the current official permit forms, exact-PDF completion, and the function-calling workflow that coordinates permit preparation. Event discovery, outreach, and menu ingestion belong to `feat/event-menu-opportunities`.

## Product decision

RollAway will obtain and verify the newest applicable permit PDFs during implementation and use those fixed snapshots. The application will not repeatedly fetch forms at runtime. Each snapshot must retain its official source URL, jurisdiction, form title, revision date when available, retrieval date, and SHA-256 checksum so a future maintainer can deliberately replace it.

## Permit inventory and acquisition

- Identify the San Francisco permits required by each supported vendor type and operation scenario.
- Download each current form once from the responsible government authority's official website.
- Verify that the form is current at implementation time and record evidence in a manifest.
- Store forms only where repository size, redistribution terms, and deployment constraints permit; otherwise store immutable object references with checksums and include fixture-safe samples.
- Do not scrape or automatically refresh forms during normal application use.
- Add an explicit manual update procedure for replacing a snapshot after a government form changes.

## Exact-PDF completion

- Preserve the official source PDF as the underlying document rather than generating a substitute form.
- Detect and map AcroForm fields when present.
- For a non-fillable form, generate a separate coordinate-based overlay while retaining the original PDF bytes.
- Map only verified vendor-profile values to fields.
- Show missing values, required attachments, initials, signatures, and legal attestations before export.
- Never fabricate business information, signatures, certifications, or answers.
- Require vendor review before producing the final completed file; do not submit permits automatically.

## Function-calling workflow

- Add typed tools for selecting the applicable permit snapshot, reading its manifest, mapping vendor data, validating required fields, producing a preview, and exporting a completed PDF.
- Keep permit applicability and required-field validation deterministic. AI may explain requirements or propose mappings but cannot make legal attestations.
- Record the form version, checksum, mapped fields, unresolved fields, tool results, and user approval in an audit record.
- Return typed errors for unsupported jurisdictions, missing snapshots, checksum mismatches, and PDF-processing failures.

## Frontend

- Add permit selection, requirements, source metadata, form preview, missing-field resolution, attachment checklist, and final-review screens.
- Clearly show that each form is a maintained snapshot and display its retrieval/revision date.
- Let the vendor download the untouched source form and the reviewed completed copy.
- Preserve fixture mode using non-sensitive sample PDFs and vendor data.

## Shared contracts

- Define versioned schemas for the permit manifest, field mappings, completion request, preview result, and audit record.
- Read confirmed vendor and menu data through shared profile contracts; do not depend on menu-agent internals.
- Do not modify event discovery or outreach contracts owned by the other branch.
- Coordinate shared vendor-profile fields before either branch merges.

## Security and privacy

- Do not place real vendor PII, credentials, or completed applications in Git or fixtures.
- Validate PDF type, size, structure, and checksum before processing.
- Keep temporary completed files private and apply explicit retention and deletion rules.
- Escape or isolate untrusted PDF text before exposing it to an AI model.

## Verification

- Tests for manifest validation, applicability rules, field mapping, missing values, and checksum failures.
- Golden-file tests confirming that completed PDFs retain their original pages and expected field values.
- Contract tests across the frontend, Functions, storage, and PDF processor.
- Browser tests for preview, correction, approval, and download.
- Update deployment instructions, snapshot-maintenance guidance, privacy documentation, and README content.

## Definition of done

Current official forms are captured once with provenance and checksums, the exact PDFs can be safely reviewed and completed, no legal information is invented, and no recurring form retrieval or automatic submission occurs.
