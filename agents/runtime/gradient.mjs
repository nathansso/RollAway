// Thin client for DigitalOcean Gradient serverless inference (OpenAI-compatible), with a
// function-calling loop. This is what actually runs the agents' reasoning on Gradient.
//
// Env:
//   GRADIENT_API_KEY        (required to run live)
//   GRADIENT_INFERENCE_URL  (default https://inference.do-ai.run/v1)
//   GRADIENT_MODEL          (default anthropic-claude-haiku-4.5)

const URL = (process.env.GRADIENT_INFERENCE_URL || "https://inference.do-ai.run/v1").replace(/\/$/, "");
// Default to a fast model: the agents only write short prose (one-line "why", a permit intro)
// over pre-gathered signals, so latency matters far more than raw size here. Benchmarked on DO
// Gradient: llama3.3-70b ~28s vs claude-haiku-4.5 ~1.9s for the same why-line. Override with
// GRADIENT_MODEL if a different model is provisioned on the target account.
const MODEL = process.env.GRADIENT_MODEL || "anthropic-claude-haiku-4.5";
// Per-call inference timeout (ms). A stalled/slow serverless call must not hang the whole request
// (or the eval suite) forever — it aborts and the caller degrades to a valid §A envelope.
const TIMEOUT_MS = Number(process.env.GRADIENT_TIMEOUT_MS || 45000);

export function haveKey() { return !!process.env.GRADIENT_API_KEY; }

async function chat(messages, { tools, tool_choice = "auto", temperature = 0, max_tokens = 1200 } = {}) {
  const key = process.env.GRADIENT_API_KEY;
  if (!key) throw new Error("GRADIENT_API_KEY not set");
  const body = { model: MODEL, messages, temperature, max_tokens };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = tool_choice; }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${URL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal
    });
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`inference timeout after ${TIMEOUT_MS}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`inference ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// One-shot completion, returns the assistant text.
export async function complete(messages, opts) {
  const j = await chat(messages, opts);
  return j.choices?.[0]?.message?.content || "";
}

// Function-calling loop: the model may emit tool_calls; we run `execute(name, args)` and feed the
// results back until it returns a final text answer (or maxRounds is hit). Returns
// { content, trace } where trace lists the tool calls made (for debugging / reasons).
export async function runWithTools({ messages, tools, execute, maxRounds = 5 }) {
  const trace = [];
  for (let round = 0; round < maxRounds; round++) {
    const j = await chat(messages, { tools });
    const msg = j.choices?.[0]?.message || {};
    const calls = msg.tool_calls || [];
    if (!calls.length) return { content: msg.content || "", trace };
    // record the assistant turn that requested tools
    messages.push({ role: "assistant", content: msg.content || "", tool_calls: calls });
    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* leave {} */ }
      let result;
      try { result = await execute(call.function.name, args); }
      catch (e) { result = { error: { code: "UPSTREAM_TIMEOUT", message: e.message } }; }
      trace.push({ name: call.function.name, args, result });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  // ran out of rounds — ask for a final answer with no more tools
  const finalMsg = [...messages, { role: "user", content: "Now produce your final answer as the JSON envelope only." }];
  return { content: await complete(finalMsg), trace };
}

export const config = { URL, MODEL };
