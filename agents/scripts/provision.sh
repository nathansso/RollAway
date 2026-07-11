#!/usr/bin/env bash
# Provision the Rollaway Gradient deployment (agents, routing, KB, tools, guardrails).
#
# Runs automatically IF DigitalOcean credentials are present; otherwise it prints the manual
# runbook pointer and exits 0. It never fabricates success — every step is guarded and reports
# its real result. The repo is the source of truth; this script pushes repo artifacts into the
# console (or tells you exactly what to paste where).
#
#   DIGITALOCEAN_ACCESS_TOKEN=... ./provision.sh
#
# The DO GenAI/Gradient CLI surface (`doctl genai ...`) evolves; commands below are guarded with
# `|| true` and cross-checked against `doctl genai --help`. Where the CLI can't yet do a step,
# the script prints the exact console action + the repo file to paste (mirrors RUNBOOK.md).

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS="$(cd "$HERE/.." && pwd)"
PROJECT="${GRADIENT_PROJECT:-rollaway}"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
warn() { printf '\033[33m    ! %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------------------------
if [ -z "${DIGITALOCEAN_ACCESS_TOKEN:-}" ]; then
  say "No DIGITALOCEAN_ACCESS_TOKEN in the environment."
  note "Nothing provisioned. Follow the click-by-click steps in agents/RUNBOOK.md instead,"
  note "then set GRADIENT_ENDPOINT_URL + GRADIENT_AGENT_KEY and run: node ../evals/run.mjs --live"
  exit 0
fi

say "Checking doctl"
if ! command -v doctl >/dev/null 2>&1; then
  warn "doctl not installed."
  note "Install: https://docs.digitalocean.com/reference/doctl/how-to/install/  (brew install doctl)"
  note "Then re-run this script. Manual fallback: agents/RUNBOOK.md"
  exit 0
fi
doctl version || true
doctl account get || { warn "doctl auth failed — check DIGITALOCEAN_ACCESS_TOKEN"; exit 1; }

say "Ensuring project '$PROJECT'"
doctl projects list || true
note "(Create/join the '$PROJECT' project in the console if the list above doesn't show it.)"

say "Agents to create (function-calling model for Spot Scout; RAG+citations for Permit Copilot)"
note "spot-scout      <- paste instructions/spot_scout.md      (+ output_envelope.md appended)"
note "permit-copilot  <- paste instructions/permit_copilot.md  (+ output_envelope.md appended)"
# Best-effort via CLI (guarded — verify subcommands with: doctl genai --help)
doctl genai agent list 2>/dev/null || warn "doctl genai agent list unavailable on this doctl version — use the console (RUNBOOK.md §2)."

say "Routing (routed entry point in front of both agents)"
note "Router logic: instructions/router.md. Location/where/park/traffic/events -> spot-scout;"
note "permit/license/fire/legal/checklist -> permit-copilot. This routed URL is what Person 1 calls."

say "Function tools on spot-scout (schemas verbatim from §B)"
note "Register 6 tools from fixtures/tool-schemas.json: get_vendors, get_closures, get_foot_traffic,"
note "get_restaurants, get_events, clearance_check. Endpoint = fixtures URL now (tunnel/throwaway"
note "Function); swap tool_base_url to Person 3's live Function URLs later (one line each)."

say "Knowledge base -> attach to permit-copilot ONLY"
note "Ingest all of agents/kb/*.md. Citation ids must equal kb/SOURCES.md (the same ids Person 3"
note "returns as 'cite'). doctl genai knowledge-base ... (verify with: doctl genai --help)"
doctl genai knowledge-base list 2>/dev/null || warn "doctl genai knowledge-base unavailable — use the console (RUNBOOK.md §4)."

say "Guardrails -> attach to BOTH agents"
note "Sensitive-data anonymization + jailbreak detection, configured to match"
note "instructions/guardrails.config.json (PII types, jailbreak patterns, refusal copy)."

say "Enrichment"
note "Run: (cd $AGENTS/enrichment && GRADIENT_API_KEY=... node classify.mjs) to produce"
note "cuisine_lookup.json, then hand it to Person 3 for get_vendors to join on."

say "Done (best-effort)."
note "Finish any console-only steps from agents/RUNBOOK.md, then hand Person 1 the routed"
note "endpoint URL + agent key, and run: node ../evals/run.mjs --live"
