"""The two agents, ported from agents/runtime/agents.mjs.

Invariants preserved verbatim:
- legality/score math is CODE, never the LLM (deterministic score + verdict);
- the model writes only short prose (why_one_line, permit intro, outreach
  drafts) and every LLM call degrades to a deterministic template;
- citations are backfilled from ACTUAL clearance rows / authored checklist
  cites — never invented;
- §E source ids are the citation vocabulary (unchanged by the migration).
"""

from __future__ import annotations

import json
import re
from typing import Any

from . import gradient, kb
from .forms import attach_form_urls, build_form_schema, resolve_form_url
from .menus import competition_overlap

VENDOR_TYPES = ["truck", "trailer", "pushcart_cooking", "pushcart_nocook"]

VT_ALIASES = {
    "pushcart_no_cook": "pushcart_nocook",
    "pushcart_nocooking": "pushcart_nocook",
    "pushcart_with_cooking": "pushcart_cooking",
    "pushcart_cook": "pushcart_cooking",
}

SAT_WEIGHT = {"low": 0.30, "medium": 0.15, "high": 0.0}

OUTPUT_ONLY = (
    "\n\n=== CRITICAL OUTPUT RULE ===\nRespond with ONLY the §A JSON envelope: a single valid JSON "
    "object, no markdown code fences, no prose before or after. Exactly one of map_actions (non-empty) "
    "or checklist (non-null) is filled."
)


def canon_vendor_type(vendor_type: Any) -> str:
    key = str(vendor_type or "").lower().strip()
    return VT_ALIASES.get(key, key)


def infer_vendor_type(message: str | None) -> str | None:
    m = (message or "").lower()
    if re.search(r"\btrailer\b", m):
        return "trailer"
    if re.search(r"\btruck\b", m):
        return "truck"
    if re.search(r"\bcart\b|pushcart", m):
        if re.search(r"cook|grill|fry|fried|propane|flame|griddle|hot food", m):
            return "pushcart_cooking"
        return "pushcart_nocook"
    return None


def load_checklist(vendor_type: Any) -> dict[str, Any] | None:
    filename = f"{canon_vendor_type(vendor_type)}.md"
    if filename not in kb.CHECKLISTS:
        return None
    try:
        doc = kb.extract_json_block(kb.read_kb(filename))
    except OSError:
        return None
    if not doc:
        return None
    return attach_form_urls(doc, kb.forms())


def extract_envelope(text: str | None) -> dict[str, Any] | None:
    """Pull the first balanced JSON object out of a model reply (tolerates
    ``` fences / stray prose)."""
    if not text:
        return None
    t = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", t)
    if fence:
        t = fence.group(1).strip()
    start = t.find("{")
    if start < 0:
        return None
    depth, in_str, esc = 0, False, False
    for i in range(start, len(t)):
        ch = t[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    parsed = json.loads(t[start:i + 1])
                except json.JSONDecodeError:
                    return None
                return parsed if isinstance(parsed, dict) else None
    return None


def degraded(agent: str, text: str | None) -> dict[str, Any]:
    return {
        "agent": agent,
        "reply_markdown": (text or "")[:2000] or "I couldn't produce a structured answer.",
        "citations": [],
        "map_actions": [],
        "checklist": None,
    }


# =============================================================================================
# SINGLE-TURN Spot Scout (map-first path): recommend_spots gathers ALL signals +
# deterministic scores and calls this ONCE. No tools, no router.
# =============================================================================================

def deterministic_score(sig: dict[str, Any]) -> float:
    ft = sig.get("foot_traffic_score")
    ft = ft if isinstance(ft, (int, float)) and not isinstance(ft, bool) else 0.5
    sat = SAT_WEIGHT.get(sig.get("restaurant_saturation"), 0.15)
    overlap = ((sig.get("menu_overlap") or {}).get("max_overlap")) or 0
    score = max(0.0, min(1.0, ft * 0.7 + sat - overlap * 0.25))
    return round(score, 2)


def deterministic_verdict(sig: dict[str, Any], score: float) -> str:
    clearance = sig.get("clearance")
    if clearance and clearance.get("allowed") is False:
        return "avoid"
    if clearance and clearance.get("allowed") is not True:
        return "caution"
    if score >= 0.6:
        return "good"
    return "caution"


def constraints_from(clearance: dict[str, Any] | None) -> list[dict[str, Any]]:
    rows = (clearance or {}).get("checks") or []
    return [
        {
            "rule": row.get("rule"),
            "pass": bool(row.get("pass")),
            "detail": (
                f"nearest {row['actual_ft']}ft"
                if row.get("actual_ft") is not None
                else (row.get("detail") or "")
            ),
        }
        for row in rows
    ]


def clearance_citations(clearance: dict[str, Any] | None) -> list[dict[str, str]]:
    out, seen = [], set()
    for row in (clearance or {}).get("checks") or []:
        cite = row.get("cite")
        if cite and cite not in seen:
            seen.add(cite)
            out.append({
                "label": f"Clearance — {row.get('rule')}",
                "source": cite,
                "quote": (
                    f"{row.get('rule')}: required {row.get('required_ft')}ft, "
                    f"actual {row.get('actual_ft')}ft, pass={str(bool(row.get('pass'))).lower()}"
                ),
            })
    return out


def template_why(cand: dict[str, Any]) -> str:
    sig = cand.get("signals") or {}
    bits = []
    ft = sig.get("foot_traffic_score")
    if isinstance(ft, (int, float)) and not isinstance(ft, bool):
        level = "strong" if ft >= 0.6 else "moderate" if ft >= 0.4 else "light"
        bits.append(f"{level} foot-traffic proxy")
    if sig.get("restaurant_saturation"):
        bits.append(f"{sig['restaurant_saturation']} restaurant saturation")
    clearance = sig.get("clearance")
    if clearance:
        allowed = clearance.get("allowed")
        bits.append(
            "fails a clearance rule" if allowed is False
            else "clears the placement rules" if allowed is True
            else "clearance unconfirmed"
        )
    mo = sig.get("menu_overlap")
    if mo and (mo.get("direct_competitors") or 0) > 0:
        bits.append(f"{mo['direct_competitors']} nearby vendor(s) sell the same menu items")
    elif mo:
        bits.append("little menu overlap nearby")
    return ", ".join(bits) + (
        " (foot traffic is a bike-activity proxy; the clearance checker is a guide, not legal clearance)."
    )


def deterministic_outreach_draft(event: dict[str, Any] | None, profile: dict[str, Any]) -> dict[str, str] | None:
    if not event:
        return None
    vendor_name = profile.get("business_name") or profile.get("vendor_name") or "our food truck"
    greeting = f"Hello {event['promoter_name']}," if event.get("promoter_name") else "Hello event team,"
    contact_line = (
        f"I found the event listing at {event['event_url']}."
        if event.get("event_url")
        else "I found the public event listing and would like to learn about vendor opportunities."
    )
    body = (
        f"{greeting}\n\n"
        f"I'm writing on behalf of {vendor_name}. We'd like to ask about bringing our food truck to "
        f"{event.get('event_name')} at {event.get('venue')} on {event.get('start')}. {contact_line}\n\n"
        "Could you share vendor requirements, availability, fees, and the appropriate next steps?\n\n"
        "Thank you,"
    )
    return {"subject": f"Food vendor inquiry for {event.get('event_name')}", "body": body}


def safe_outreach_draft(
    candidate: dict[str, Any], proposed: dict[str, Any] | None, profile: dict[str, Any]
) -> dict[str, str] | None:
    event = candidate.get("event_opportunity")
    if not event:
        return None
    if not event.get("promoter_name"):
        return deterministic_outreach_draft(event, profile)
    if not proposed or not isinstance(proposed.get("subject"), str) or not isinstance(proposed.get("body"), str):
        return deterministic_outreach_draft(event, profile)
    combined = f"{proposed['subject']} {proposed['body']}"
    if re.search(r"@|\b(?:emailed|contacted|sent the message|reached out)\b", combined, re.IGNORECASE):
        return deterministic_outreach_draft(event, profile)
    return {"subject": proposed["subject"][:180], "body": proposed["body"][:1600]}


def safe_outreach_reply(reply: str, map_actions: list[dict[str, Any]]) -> str:
    if not any(action.get("outreach_draft") for action in map_actions):
        return reply
    if not reply or re.search(
        r"\b(?:i|we)(?:'ve| have)?\s+(?:contacted|emailed|messaged|reached out|sent)\b", reply, re.IGNORECASE
    ):
        return (
            "A nearby event may be a vendor opportunity. Here's a draft you can send after "
            "reviewing the event listing and organizer details."
        )
    if re.search(r"draft you can send", reply, re.IGNORECASE):
        return reply
    return f"{reply} Here's a draft you can send after reviewing the event listing and organizer details."


def overlap_summary(mo: dict[str, Any] | None) -> dict[str, Any] | None:
    if not mo:
        return None
    top = [
        f"{c['name']} ({round(c['overlap_score'] * 100)}% item overlap, {c['price_summary']})"
        for c in sorted(
            (c for c in (mo.get("competitors") or []) if c.get("overlap_score", 0) > 0),
            key=lambda c: -c["overlap_score"],
        )[:2]
    ]
    return {
        "max_overlap": mo.get("max_overlap"),
        "direct_competitors": mo.get("direct_competitors"),
        "top": top,
    }


async def run_spot_scout_single_turn(payload: dict[str, Any]) -> tuple[dict[str, Any], list[Any]]:
    profile = payload.get("user_profile") or {}
    candidates = payload.get("candidates")
    candidates = candidates if isinstance(candidates, list) else []

    # 1. Fold in Menu-RAG competition overlap per candidate (items + prices).
    for cand in candidates:
        sig = cand.setdefault("signals", {})
        if (
            not sig.get("menu_overlap")
            and profile.get("menu_kb_id")
            and isinstance(sig.get("competitors"), list)
            and sig["competitors"]
        ):
            try:
                result = await competition_overlap(
                    menu_kb_id=profile["menu_kb_id"], competitors=sig["competitors"]
                )
                sig["menu_overlap"] = {
                    "max_overlap": result["summary"]["max_overlap"],
                    "direct_competitors": result["summary"]["direct_competitors"],
                    "most_overlapping": result["summary"]["most_overlapping"],
                    "competitors": result["competitors"],
                }
            except Exception as error:  # degrade, never fail the request
                sig["menu_overlap"] = None
                sig["menu_overlap_error"] = str(error)

    # 2. Deterministic score/verdict (provided values win; never model-computed).
    for cand in candidates:
        sig = cand.get("signals") or {}
        if not isinstance(cand.get("score"), (int, float)) or isinstance(cand.get("score"), bool):
            cand["score"] = deterministic_score(sig)
        if not cand.get("verdict"):
            cand["verdict"] = deterministic_verdict(sig, cand["score"])

    # 3. ONE model call for why_one_line + reply (falls back to templates).
    whys, outreach_drafts, reply = None, None, ""
    if gradient.have_key() and candidates:
        brief = [
            {
                "id": c.get("id"),
                "score": c.get("score"),
                "verdict": c.get("verdict"),
                "foot_traffic_score": (c.get("signals") or {}).get("foot_traffic_score"),
                "restaurant_saturation": (c.get("signals") or {}).get("restaurant_saturation"),
                "clearance_allowed": ((c.get("signals") or {}).get("clearance") or {}).get("allowed"),
                "nearby_vendors": [v.get("name") for v in (c.get("signals") or {}).get("nearby_vendors") or []],
                "menu_overlap": overlap_summary((c.get("signals") or {}).get("menu_overlap")),
                "event_opportunity": c.get("event_opportunity"),
            }
            for c in candidates
        ]
        sys = (
            "You are Rollaway's Spot Scout, a SINGLE-TURN explainer. You are given candidate spots with "
            "their ALREADY-COMPUTED deterministic score/verdict and pre-gathered signals. Do NOT recompute "
            "scores or legality. For each candidate write ONE tight sentence ('why_one_line') explaining why "
            "it earned its score — cover demand (foot traffic is a bike-activity PROXY), competition (describe "
            "menu overlap by ITEMS + PRICES, never a cuisine label), and legality (the clearance checker is a "
            "GUIDE, not legal clearance). When event_opportunity is present, draft a short vendor outreach "
            "message using ONLY the supplied event fields. Never invent an email, phone, organizer name, or claim "
            "that contact was made. Describe it in reply_markdown as 'here's a draft you can send'. Then write a "
            "2-3 sentence overall reply naming the top pick. Output ONLY JSON: "
            '{"reply_markdown":"...","why_one_line":{"<id>":"..."},'
            '"outreach_draft":{"<id>":{"subject":"...","body":"..."}}}.'
        )
        try:
            out = await gradient.complete(
                [
                    {"role": "system", "content": sys},
                    {"role": "user", "content": f"Candidates: {json.dumps(brief)}"},
                ],
                max_tokens=500,
            )
            parsed = extract_envelope(out)
            if parsed and parsed.get("why_one_line"):
                whys = parsed["why_one_line"]
                outreach_drafts = parsed.get("outreach_draft")
                reply = parsed.get("reply_markdown") or ""
        except Exception:
            pass  # fall through to templates

    # 4. Assemble map_actions deterministically (ranked by score).
    ranked = sorted(candidates, key=lambda c: -(c.get("score") or 0))
    map_actions = []
    for c in ranked:
        sig = c.get("signals") or {}
        why = (whys or {}).get(c.get("id")) or (whys or {}).get(str(c.get("id"))) or template_why(c)
        reasons = [why]
        mo = overlap_summary(sig.get("menu_overlap"))
        if mo and mo["top"]:
            reasons.append("Menu overlap: " + "; ".join(mo["top"]))
        proposed = None
        if outreach_drafts:
            proposed = outreach_drafts.get(c.get("id")) or outreach_drafts.get(str(c.get("id")))
        outreach_draft = safe_outreach_draft(c, proposed, profile)
        action = {
            "type": "add_spot",
            "id": c.get("id"),
            "point": c.get("point"),
            "verdict": c.get("verdict"),
            "score": c.get("score"),
            "reasons": reasons,
            "breakdown": {
                "constraints": constraints_from(sig.get("clearance")),
                "demand": {
                    "foot_traffic_score": (
                        sig["foot_traffic_score"]
                        if isinstance(sig.get("foot_traffic_score"), (int, float))
                        and not isinstance(sig.get("foot_traffic_score"), bool)
                        else 0
                    ),
                    "restaurant_saturation": sig.get("restaurant_saturation") or "unknown",
                },
                "nearby_vendors": [
                    {
                        "name": v.get("name"),
                        "cuisine": v.get("cuisine") or "unknown",
                        "scheduled_here": bool(v.get("scheduled_here")),
                    }
                    for v in sig.get("nearby_vendors") or []
                ],
            },
        }
        if c.get("event_opportunity"):
            action["event_opportunity"] = c["event_opportunity"]
            action["outreach_draft"] = outreach_draft
        map_actions.append(action)

    # 5. Citations from the ACTUAL clearance rows across candidates.
    citations, seen = [], set()
    for c in ranked:
        for citation in clearance_citations((c.get("signals") or {}).get("clearance")):
            if citation["source"] not in seen:
                seen.add(citation["source"])
                citations.append(citation)

    if not reply:
        if map_actions:
            top = map_actions[0]
            reply = (
                f"Top pick: **{top['id']}** ({top['verdict']}). {top['reasons'][0]} "
                "Foot traffic is a bike-activity proxy, and the clearance checker is a guide, "
                "not legal clearance."
            )
        else:
            reply = "No candidate spots were provided."

    reply = safe_outreach_reply(reply, map_actions)
    env = {
        "agent": "spot_scout",
        "reply_markdown": reply,
        "citations": citations,
        "map_actions": map_actions,
        "checklist": None,
    }
    return env, []


# =============================================================================================
# Permit Copilot
# =============================================================================================

async def run_permit_copilot(message: str, context: dict[str, Any]) -> tuple[dict[str, Any], list[Any]]:
    canon = canon_vendor_type(context.get("vendor_type"))
    vendor_type = canon if canon in VENDOR_TYPES else infer_vendor_type(message)
    retrieved = await kb.retrieve_rule_docs_semantic(message)

    # Fast path: authored checklist straight from kb/<vt>.md (single source of
    # truth — never regenerated). Model only writes a short prose reply.
    checklist = load_checklist(vendor_type) if vendor_type else None
    if checklist:
        sys = (
            "You are Rollaway's Permit Copilot. You are given a vendor's AUTHORED permit checklist (JSON) "
            "and relevant SF rule docs. Write a SHORT, friendly plain-text answer (2-4 sentences): what they "
            "need, what they do NOT need (call out no-DMV / no-Fire when true for this vendor type), and the "
            "hidden clocks (30-day public notice, 90-day document window, 15-day appeal). Answer the user's "
            "actual question. Do NOT output JSON, do NOT re-list every step. Be honest: the checker is a guide, "
            "not legal clearance."
        )
        usr = (
            f"Vendor type: {vendor_type}\nUser question: {message}\n"
            f"Authored checklist: {json.dumps(checklist)}\n\n"
            f"Relevant rule docs:\n{kb.read_kb_files(['SOURCES.md', *retrieved])}"
        )
        try:
            reply = (await gradient.complete(
                [{"role": "system", "content": sys}, {"role": "user", "content": usr}],
                max_tokens=320,
            )).strip()
        except Exception:
            reply = ""
        if not reply:
            reply = f"Here is your {vendor_type.replace('_', ' ')} permit checklist across the SF agencies."
        env = {
            "agent": "permit_copilot",
            "reply_markdown": reply,
            "citations": kb.citations_for(checklist, retrieved),
            "map_actions": [],
            "checklist": checklist,
        }
        return env, []

    # Fallback: no vendor type resolvable -> grounded model answer, lean context.
    system = (
        f"{kb.read_instruction('permit_copilot.md')}\n\n---\n\n"
        f"{kb.read_instruction('output_envelope.md')}\n\n---\n"
        "KNOWLEDGE BASE — ground every claim in this text and cite the matching source id:\n\n"
        f"{kb.kb_context(vendor_type, message, retrieved)}{OUTPUT_ONLY}"
    )
    try:
        content = await gradient.complete([
            {"role": "system", "content": system},
            {"role": "user", "content": f"User message: {message}\nContext: {json.dumps(context)}"},
        ])
    except Exception as error:
        content = f"error: {error}"
    env = extract_envelope(content) or degraded("permit_copilot", content)
    env["agent"] = "permit_copilot"
    if not isinstance(env.get("map_actions"), list):
        env["map_actions"] = []
    if not isinstance(env.get("citations"), list):
        env["citations"] = []
    if "checklist" not in env:
        env["checklist"] = None
    env["checklist"] = attach_form_urls(env["checklist"], kb.forms()) if env["checklist"] else None
    return env, []


# =============================================================================================
# Paperwork: form_fill + form_pdf
# =============================================================================================

def resolve_form_pdf_url(source: str | None) -> str | None:
    if not source or not re.match(r"^[a-z0-9-]+$", source):
        return None
    return resolve_form_url(source, kb.forms())


async def run_form_fill(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload.get("source") or payload.get("cite")
    if not source or not re.match(r"^[a-z0-9-]+$", str(source)):
        return {"error": {"code": "BAD_INPUT", "message": "missing or invalid form `source` id"}}
    profile = {
        "vendor_type": payload.get("vendor_type"),
        **(payload.get("context") or {}),
        **(payload.get("profile") or {}),
    }
    schema = build_form_schema(str(source), kb.forms(), kb.form_fields(), profile)
    if not schema:
        return {"error": {"code": "BAD_INPUT", "message": f"no verified fillable form for source '{source}'"}}

    outstanding = [f["label"] for f in schema["fields"] if f["required"] and f["status"] == "unknown"]
    filled_count = sum(1 for f in schema["fields"] if f["status"] == "filled")
    fallback = (
        f"{schema['form']} ({schema['agency']}). Pre-filled {filled_count} of {len(schema['fields'])} "
        "fields from your profile."
        + (f" Still needed: {', '.join(outstanding)}." if outstanding else " Every required field is filled.")
        + " Review on the official form before submitting - this is a guide, not legal clearance."
    )
    summary = fallback
    if gradient.have_key():
        try:
            sys = (
                "You are Rollaway's paperwork assistant. In 1-2 friendly sentences, tell the vendor which "
                "of this form's fields are still needed and remind them this is a guide, not legal clearance. "
                "Use ONLY the provided field data — never invent a value or a field. No JSON, no lists."
            )
            usr = (
                f"Form: {schema['form']} ({schema['agency']}).\nFields: {json.dumps(schema['fields'])}\n"
                f"Still needed (required, blank): {json.dumps(outstanding)}"
            )
            out = (await gradient.complete(
                [{"role": "system", "content": sys}, {"role": "user", "content": usr}],
                max_tokens=160,
            )).strip()
            if out:
                summary = out
        except Exception:
            pass
    return {**schema, "summary": summary}
