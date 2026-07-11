// Turns fixtures/tool-schemas.json into OpenAI-style tool definitions the model can call, and
// executes tool calls against the tool server (fixtures now; Person 3's Functions later).
//
// Env: TOOL_BASE_URL (default http://localhost:8787 — the fixture server).
// Swap TOOL_BASE_URL for Person 3's live Function base URL; the tool NAMES already match (§B).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const schemas = JSON.parse(readFileSync(resolve(__dir, "..", "fixtures", "tool-schemas.json"), "utf8"));

const BASE = (process.env.TOOL_BASE_URL || schemas.tool_base_url || "http://localhost:8787").replace(/\/$/, "");
const ENDPOINT = Object.fromEntries(schemas.tools.map((t) => [t.name, t.endpoint]));

// OpenAI tools array for the chat-completions request.
export const openaiTools = schemas.tools.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.parameters }
}));

export async function executeTool(name, args) {
  const path = ENDPOINT[name];
  if (!path) return { error: { code: "BAD_INPUT", message: `unknown tool ${name}` } };
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args || {})
  });
  return res.json();   // §B payload, or the §B error envelope on 4xx/5xx
}

export const toolBase = BASE;
