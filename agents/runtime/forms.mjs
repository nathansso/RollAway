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

export function resolveFormUrl(cite, forms) {
  const value = forms.get(cite)?.form_url;
  if (!value || value === "SOURCE-NEEDED") return null;
  if (!isAllowedFormUrl(value)) {
    console.warn(`[permit-forms] rejected non-allowlisted form URL for ${cite}`);
    return null;
  }
  return value;
}

export function attachFormUrls(checklist, forms) {
  if (!checklist || !Array.isArray(checklist.steps)) return checklist;
  return {
    ...checklist,
    steps: checklist.steps.map((step) => ({ ...step, form_url: resolveFormUrl(step.cite, forms) })),
  };
}
