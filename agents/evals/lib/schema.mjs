// §A envelope + §D checklist validators (docs/CONTRACTS.md). Pure structural checks, no deps.

const isStr = (v) => typeof v === "string";
const isNum = (v) => typeof v === "number" && !Number.isNaN(v);
const isBool = (v) => typeof v === "boolean";
const isArr = Array.isArray;
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

const VENDOR_TYPES = ["truck", "trailer", "pushcart_cooking", "pushcart_nocook"];
const VERDICTS = ["good", "caution", "avoid"];
const STATUSES = ["todo", "in_progress", "done"];

export function validateChecklist(cl, path = "checklist") {
  const e = [];
  if (!isObj(cl)) return [`${path}: not an object`];
  if (!VENDOR_TYPES.includes(cl.vendor_type)) e.push(`${path}.vendor_type invalid: ${cl.vendor_type}`);
  if (!isArr(cl.steps) || cl.steps.length === 0) { e.push(`${path}.steps must be a non-empty array`); return e; }
  cl.steps.forEach((s, i) => {
    const p = `${path}.steps[${i}]`;
    if (!Number.isInteger(s.order)) e.push(`${p}.order must be int`);
    if (!isStr(s.agency)) e.push(`${p}.agency must be string`);
    if (!isStr(s.title)) e.push(`${p}.title must be string`);
    if (!isStr(s.detail)) e.push(`${p}.detail must be string`);
    if (!(s.deadline_days === null || Number.isInteger(s.deadline_days))) e.push(`${p}.deadline_days must be int|null`);
    if (!(s.deadline_label === null || isStr(s.deadline_label))) e.push(`${p}.deadline_label must be string|null`);
    if (!isStr(s.cite)) e.push(`${p}.cite must be string`);
    if (!(s.form_url === undefined || s.form_url === null || isStr(s.form_url))) e.push(`${p}.form_url must be string|null when present`);
    if (!STATUSES.includes(s.status)) e.push(`${p}.status invalid: ${s.status}`);
  });
  return e;
}

function validateMapAction(a, p) {
  const e = [];
  if (!isStr(a.type)) e.push(`${p}.type must be string`);
  if (!isStr(a.id)) e.push(`${p}.id must be string`);
  if (!isObj(a.point) || !isNum(a.point.lat) || !isNum(a.point.lng)) e.push(`${p}.point must be {lat,lng}`);
  if (!VERDICTS.includes(a.verdict)) e.push(`${p}.verdict invalid: ${a.verdict}`);
  if (!isNum(a.score) || a.score < 0 || a.score > 1) e.push(`${p}.score must be 0..1`);
  if (!isArr(a.reasons) || !a.reasons.every(isStr)) e.push(`${p}.reasons must be string[]`);
  if (!(a.event_opportunity === undefined || a.event_opportunity === null || isObj(a.event_opportunity)))
    e.push(`${p}.event_opportunity must be object|null when present`);
  if (isObj(a.event_opportunity)) {
    const ev = a.event_opportunity;
    for (const key of ["event_name", "venue", "start"]) if (!isStr(ev[key])) e.push(`${p}.event_opportunity.${key} must be string`);
    if (!isNum(ev.expected_attendance)) e.push(`${p}.event_opportunity.expected_attendance must be number`);
    if (!(ev.event_url === null || isStr(ev.event_url))) e.push(`${p}.event_opportunity.event_url must be string|null`);
    if (!(ev.promoter_name === null || isStr(ev.promoter_name))) e.push(`${p}.event_opportunity.promoter_name must be string|null`);
  }
  if (!(a.outreach_draft === undefined || a.outreach_draft === null || isObj(a.outreach_draft)))
    e.push(`${p}.outreach_draft must be object|null when present`);
  if (isObj(a.outreach_draft) && (!isStr(a.outreach_draft.subject) || !isStr(a.outreach_draft.body)))
    e.push(`${p}.outreach_draft must be {subject:string, body:string}`);
  if (!a.event_opportunity && a.outreach_draft) e.push(`${p}.outreach_draft requires event_opportunity`);
  const b = a.breakdown;
  if (!isObj(b)) { e.push(`${p}.breakdown missing`); return e; }
  if (!isArr(b.constraints)) e.push(`${p}.breakdown.constraints must be array`);
  else b.constraints.forEach((cst, j) => {
    const cp = `${p}.breakdown.constraints[${j}]`;
    if (!isStr(cst.rule)) e.push(`${cp}.rule must be string`);
    if (!isBool(cst.pass)) e.push(`${cp}.pass must be bool`);
    if (!isStr(cst.detail)) e.push(`${cp}.detail must be string`);
  });
  if (!isObj(b.demand) || !isNum(b.demand.foot_traffic_score) || !isStr(b.demand.restaurant_saturation))
    e.push(`${p}.breakdown.demand must be {foot_traffic_score:number, restaurant_saturation:string}`);
  if (!isArr(b.nearby_vendors)) e.push(`${p}.breakdown.nearby_vendors must be array`);
  else b.nearby_vendors.forEach((nv, k) => {
    const np = `${p}.breakdown.nearby_vendors[${k}]`;
    if (!isStr(nv.name)) e.push(`${np}.name must be string`);
    if (!isStr(nv.cuisine)) e.push(`${np}.cuisine must be string`);
    if (!isBool(nv.scheduled_here)) e.push(`${np}.scheduled_here must be bool`);
  });
  return e;
}

// Validate the §A envelope. Returns string[] of errors ([] = valid).
export function validateEnvelope(env) {
  const e = [];
  if (!isObj(env)) return ["envelope: not an object"];
  if (!["spot_scout", "permit_copilot"].includes(env.agent)) e.push(`agent invalid: ${env.agent}`);
  if (!isStr(env.reply_markdown)) e.push("reply_markdown must be string");
  if (!isArr(env.citations)) e.push("citations must be array");
  else env.citations.forEach((ct, i) => {
    const p = `citations[${i}]`;
    if (!isStr(ct.label)) e.push(`${p}.label must be string`);
    if (!isStr(ct.source)) e.push(`${p}.source must be string`);
    if (!isStr(ct.quote)) e.push(`${p}.quote must be string`);
  });
  if (!isArr(env.map_actions)) e.push("map_actions must be array");
  else env.map_actions.forEach((a, i) => e.push(...validateMapAction(a, `map_actions[${i}]`)));
  if (!(env.checklist === null || isObj(env.checklist))) e.push("checklist must be object|null");
  else if (isObj(env.checklist)) e.push(...validateChecklist(env.checklist));
  // Exactly-one rule for substantive answers: never BOTH populated.
  if (isArr(env.map_actions) && env.map_actions.length > 0 && env.checklist !== null)
    e.push("both map_actions and checklist are populated (must be exactly one)");
  return e;
}

// Collect every source/cite id referenced by an envelope (citations + checklist steps).
export function envelopeSourceIds(env) {
  const ids = new Set();
  (env.citations || []).forEach((c) => c.source && ids.add(c.source));
  if (isObj(env.checklist)) (env.checklist.steps || []).forEach((s) => s.cite && ids.add(s.cite));
  (env.map_actions || []).forEach((a) => {}); // map actions carry no source ids directly
  return ids;
}

export { VENDOR_TYPES };
