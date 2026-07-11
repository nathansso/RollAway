// Orchestrator for POST /chat: guardrails -> route -> agent -> §A envelope.
// Reuses the SAME guardrail config, router keyword lists, and §A validator as the eval suite,
// so what ships is what the gate checks.

import { anonymize, detectJailbreak, refusalEnvelope } from "../evals/lib/guardrails.mjs";
import { route } from "../evals/lib/route.mjs";
import { validateEnvelope } from "../evals/lib/schema.mjs";
import { runSpotScout, runPermitCopilot } from "./agents.mjs";

// Returns { envelope, meta } — meta carries routing/validation/tool-trace for debugging (not
// part of the §A contract; the frontend reads `envelope`).
export async function handleChat({ session_id = "anon", message = "", context = {} } = {}) {
  const t0 = Date.now();

  // 1. anonymize BEFORE anything is logged or sent to the model
  const { text: safe, redacted_types } = anonymize(message);
  const log = { session_id, redacted_input: safe, redacted_types };

  // 2. jailbreak -> refuse, never route to an agent
  if (detectJailbreak(safe)) {
    console.log("[chat]", JSON.stringify({ ...log, decision: "refused(jailbreak)" }));
    return { envelope: refusalEnvelope(), meta: { agent: "guardrail", refused: true, ms: Date.now() - t0 } };
  }

  // 3. route on the redacted text
  const { agent, reason } = route(safe);

  // 4. run the agent (model sees redacted text only)
  let env, trace = [];
  try {
    const r = agent === "permit_copilot" ? await runPermitCopilot(safe, context) : await runSpotScout(safe, context);
    env = r.env; trace = r.trace;
  } catch (e) {
    env = { agent, reply_markdown: `The ${agent} model call failed: ${e.message}`, citations: [], map_actions: [], checklist: null };
  }

  // 5. validate against §A (return anyway; surface issues in meta)
  const errors = validateEnvelope(env);
  console.log("[chat]", JSON.stringify({ ...log, agent, reason, valid: errors.length === 0, tools: trace.map((t) => t.name), ms: Date.now() - t0 }));
  return { envelope: env, meta: { agent, reason, valid: errors.length === 0, errors, tools: trace, ms: Date.now() - t0 } };
}
