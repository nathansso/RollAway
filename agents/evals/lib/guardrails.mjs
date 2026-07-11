// Reference implementation of instructions/guardrails.md, driven by guardrails.config.json.
// Used by the offline eval to exercise the real jailbreak patterns + PII rules. In production the
// Gradient console's built-in guardrails are configured to match the same JSON.
import { read } from "./util.mjs";

const cfg = JSON.parse(read("instructions/guardrails.config.json"));

const JAILBREAK_RES = cfg.jailbreak.patterns.map((p) => new RegExp(p, "i"));
const PII_RULES = cfg.anonymization.pii_types.map((t) => ({ ...t, re: new RegExp(t.regex, "g") }));

export function detectJailbreak(text) {
  const t = text || "";
  for (const re of JAILBREAK_RES) if (re.test(t)) return true;
  return false;
}

// Replace every PII match with its token. This is what runs BEFORE logging.
export function anonymize(text) {
  let out = text || "";
  const hits = [];
  for (const rule of PII_RULES) {
    out = out.replace(rule.re, () => { hits.push(rule.type); return rule.token; });
  }
  return { text: out, redacted_types: hits };
}

export const refusalMarkdown = cfg.jailbreak.refusal_markdown;

// Build the refusal envelope (valid §A) for a blocked request.
export function refusalEnvelope() {
  return {
    agent: "spot_scout",
    reply_markdown: refusalMarkdown,
    citations: [],
    map_actions: [],
    checklist: null
  };
}
