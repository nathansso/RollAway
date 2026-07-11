#!/usr/bin/env bash
# One-shot verification of the whole Person 2 layer (mirrors PERSON2 task §5).
# Runs the fixture server + curls every route (incl. the error envelope), the enrichment mock,
# the offline eval gate, and the source-id / tool-schema / no-model-math greps. Reports real
# output; exits non-zero if anything fails.
#
#   agents/scripts/verify.sh

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS="$(cd "$HERE/.." && pwd)"
FAIL=0
hr() { printf '\n\033[1m======== %s ========\033[0m\n' "$*"; }

# 1. Fixtures --------------------------------------------------------------------------------
hr "1. Fixture tool server (§B payloads + error envelope)"
cd "$AGENTS/fixtures"
[ -d node_modules ] || npm install --no-audit --no-fund >/dev/null 2>&1
PORT=8799 node serve.js >/tmp/rollaway-fixtures.log 2>&1 &
SRV=$!
sleep 1
for t in get_vendors get_closures get_foot_traffic get_restaurants get_events check_clearance; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8799/$t")
  echo "  /$t -> HTTP $code"
  [ "$code" = "200" ] || FAIL=1
done
errcode=$(curl -s "http://localhost:8799/get_vendors?fail=RATE_LIMIT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).error.code)}catch{console.log("NOJSON")}})')
echo "  /get_vendors?fail=RATE_LIMIT -> error.code=$errcode"
[ "$errcode" = "RATE_LIMIT" ] || FAIL=1
kill $SRV 2>/dev/null

# 2. Enrichment ------------------------------------------------------------------------------
hr "2. Enrichment (--mock) produces cuisine_lookup.json within §C enum"
cd "$AGENTS/enrichment"
[ -f permits.json ] || curl -s "https://data.sfgov.org/resource/rqzj-sfat.json?\$limit=5000" > permits.json
node classify.mjs --mock || FAIL=1

# 3. Evals -----------------------------------------------------------------------------------
hr "3. Offline eval gate"
cd "$AGENTS/evals"
node run.mjs --offline || FAIL=1

# 4. Greps -----------------------------------------------------------------------------------
hr "4. Grep invariants"
cd "$AGENTS"
echo "  -- every cite id in checklists resolves in SOURCES.md (handled by eval check #5) --"
echo "  -- no model-computed legality numbers in agent prompts (only as tool-explain) --"
# The distance numbers 75/7/500 must appear in spot_scout.md ONLY inside the tool schema/explain
# context, never as an instruction to compute. Flag any imperative-math phrasing.
if grep -nEi 'calculate|compute the distance|measure the distance|work out (the )?(distance|feet)' instructions/spot_scout.md instructions/permit_copilot.md; then
  echo "  ! found imperative-math phrasing above"; FAIL=1
else
  echo "  OK: no imperative 'calculate/compute distance' phrasing in agent prompts"
fi
if grep -qi 'never do legality or distance math' instructions/spot_scout.md; then
  echo "  OK: spot_scout.md contains the hard no-math rule"
else
  echo "  ! spot_scout.md missing the hard no-math rule"; FAIL=1
fi

hr "RESULT"
if [ "$FAIL" = "0" ]; then echo "ALL GREEN"; else echo "SOMETHING FAILED (see above)"; fi
exit $FAIL
