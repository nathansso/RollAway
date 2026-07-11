// Deterministic reference implementation of the router in instructions/router.md.
// The LLM router follows the SAME keyword lists; this lets the offline eval assert routing
// without a live model. If you change router.md's lists, mirror them here (the eval will catch
// drift on the seed prompts).

const PERMIT = [
  "permit", "permits", "license", "licence", "licensing", "checklist", "legal", "get legal",
  "law", "ordinance", "regulation", "requirement", "requirements", "fire permit", "health permit",
  "business registration", "registration", "dmv", "agency", "agencies", "public works",
  "public health", "dph", "treasurer", "tax collector", "fee", "fees", "appeal", "public notice",
  "deadline", "commissary", "plan review", "do i need a permit", "what permits", "which permits"
];

const LOCATION = [
  "where", "best spot", "spot", "best place", "good place", "place to", "foot traffic",
  "foot-traffic", "traffic", "busy", "crowd", "crowds", "customers", "demand", "saturation",
  "nearby restaurants", "restaurants nearby", "event", "events", "game", "concert", "festival",
  "closure", "closures", "street closure", "nearby", "near me", "corner", "block", "lunch",
  "dinner", "breakfast", "other trucks", "competition"
];

// Placement / geometry force-patterns: a "can I place HERE?" question is a Spot Scout geometry
// question even if it names a rule.
const PLACEMENT = [
  /\bpark\b/, /\bparking\b/, /\bset ?up\b/, /feet from/, /\bft from\b/, /meters from/,
  /how far/, /how close/, /can i park/, /can i set ?up/, /can i vend/, /distance from/
];

function countHits(text, list) {
  let n = 0;
  for (const kw of list) if (text.includes(kw)) n++;
  return n;
}

// Returns { agent, reason }.
export function route(message) {
  const t = (message || "").toLowerCase();
  for (const re of PLACEMENT) {
    if (re.test(t)) return { agent: "spot_scout", reason: `placement force-pattern ${re}` };
  }
  const permitHits = countHits(t, PERMIT);
  const locationHits = countHits(t, LOCATION);
  if (permitHits > locationHits) return { agent: "permit_copilot", reason: `permit ${permitHits} > location ${locationHits}` };
  if (locationHits > permitHits) return { agent: "spot_scout", reason: `location ${locationHits} > permit ${permitHits}` };
  return { agent: "spot_scout", reason: `ambiguous (permit ${permitHits} = location ${locationHits}) -> default spot_scout` };
}
