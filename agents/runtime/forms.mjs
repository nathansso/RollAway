// Deterministic permit-form lookup and defense-in-depth URL validation.

export const FORM_DOMAIN_ALLOWLIST = Object.freeze([
  "sf.gov",
  "www.sf.gov",
  "sfpublicworks.org",
  "www.sfpublicworks.org",
  "sf-fire.org",
  "www.sf-fire.org",
  "sfdph.org",
  "www.sfdph.org",
  "sftreasurer.org",
  "www.sftreasurer.org",
]);

export function isAllowedFormUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && FORM_DOMAIN_ALLOWLIST.includes(url.hostname.toLowerCase());
  } catch { return false; }
}

export function parseFormsTable(markdown) {
  const forms = new Map();
  for (const line of String(markdown || "").split(/\r?\n/)) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, ""));
    if (cells.length < 5 || !/^[a-z0-9-]+$/.test(cells[0]) || /^-+$/.test(cells[0]) || cells[0] === "source") continue;
    forms.set(cells[0], { source: cells[0], agency: cells[1], form: cells[2], form_url: cells[3] });
  }
  return forms;
}

// Parse kb/FORM_FIELDS.md -> Map<cite, [{ profile_key, label }]> (ordered, one entry per row).
// Rows: | `source id` | `profile_key` | Field label |. This is authored data (source of truth for
// WHICH applicant fields the app can pre-fill on each form); values are never authored here.
export function parseFormFieldsTable(markdown) {
  const fields = new Map();
  for (const line of String(markdown || "").split(/\r?\n/)) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, ""));
    if (cells.length < 3 || !/^[a-z0-9-]+$/.test(cells[0]) || /^-+$/.test(cells[0]) || cells[0] === "source") continue;
    const [cite, profile_key, label] = cells;
    if (!/^[a-z0-9_]+$/.test(profile_key) || !label) continue;
    if (!fields.has(cite)) fields.set(cite, []);
    fields.get(cite).push({ profile_key, label });
  }
  return fields;
}

// Format one supplied profile value for a form field. Objects with lat/lng (pinned_point) render
// as "lat, lng"; strings/numbers copy through; anything else (missing, empty, non-scalar) is
// treated as unknown (null) — we NEVER invent a value.
export function formatFieldValue(profile, key) {
  const v = profile ? profile[key] : undefined;
  if (v == null || v === "") return null;
  if (typeof v === "object") {
    if (typeof v.lat === "number" && typeof v.lng === "number") return `${v.lat}, ${v.lng}`;
    return null;
  }
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "string") return v;
  return null;
}

// Build the viewable/persistable filled-form record for a step's cite. Returns null unless the cite
// resolves to a REAL allowlisted form_url (so SOURCE-NEEDED/off-domain forms produce no record) and
// FORM_FIELDS declares fields for it. Only supplied profile values are filled; unknowns are marked.
export function buildFilledForm(cite, forms, formFields, profile) {
  const form_url = resolveFormUrl(cite, forms);
  if (!form_url) return null;                       // no real form => no paperwork record
  const meta = forms.get(cite);
  const specs = formFields ? formFields.get(cite) : null;
  if (!meta || !specs || !specs.length) return null;
  const fields = specs.map(({ profile_key, label }) => {
    const value = formatFieldValue(profile, profile_key);
    return { label, profile_key, value, status: value == null ? "unknown" : "filled" };
  });
  return { agency: meta.agency, form: meta.form, form_url, fields };
}

export function resolveFormUrl(cite, forms) {
  const value = forms.get(cite)?.form_url;
  if (!value || value === "SOURCE-NEEDED") return null;
  if (!isAllowedFormUrl(value)) {
    console.warn(`[permit-forms] rejected non-allowlisted form URL for ${cite}`);
    return null;
  }
  return value;
}

// Attach the deterministic `form_url` (always) and, when `opts.formFields` is supplied, a
// `filled_form` paperwork record populated from `opts.profile` (both additive, §D). Callers that
// pass no opts keep the pre-existing url-only behavior unchanged.
export function attachFormUrls(checklist, forms, opts = {}) {
  if (!checklist || !Array.isArray(checklist.steps)) return checklist;
  const { formFields = null, profile = null } = opts;
  return {
    ...checklist,
    steps: checklist.steps.map((step) => {
      const out = { ...step, form_url: resolveFormUrl(step.cite, forms) };
      if (formFields) out.filled_form = buildFilledForm(step.cite, forms, formFields, profile);
      return out;
    }),
  };
}
