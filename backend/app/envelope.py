"""§A envelope + §D checklist validators (docs/CONTRACTS.md).

Python port of agents/evals/lib/schema.mjs — pure structural checks used by
the ?debug=1 meta and the backend test suite. Endpoints return the envelope
dicts as-is (no Pydantic coercion) so additive optional fields pass through
untouched, exactly like the Node runtime.
"""

from __future__ import annotations

from typing import Any

VENDOR_TYPES = ["truck", "trailer", "pushcart_cooking", "pushcart_nocook"]
VERDICTS = ["good", "caution", "avoid"]
STATUSES = ["todo", "in_progress", "done"]
FIELD_STATUSES = ["filled", "unknown"]
FIELD_TYPES = ["text", "email", "tel", "date", "number", "select", "textarea"]


def _is_str(v: Any) -> bool:
    return isinstance(v, str)


def _is_num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _is_bool(v: Any) -> bool:
    return isinstance(v, bool)


def _is_arr(v: Any) -> bool:
    return isinstance(v, list)


def _is_obj(v: Any) -> bool:
    return isinstance(v, dict)


def _validate_filled_form(ff: dict[str, Any], p: str) -> list[str]:
    e: list[str] = []
    if not _is_str(ff.get("agency")):
        e.append(f"{p}.agency must be string")
    if not _is_str(ff.get("form")):
        e.append(f"{p}.form must be string")
    if not _is_str(ff.get("form_url")):
        e.append(f"{p}.form_url must be string")
    if not _is_arr(ff.get("fields")):
        e.append(f"{p}.fields must be array")
        return e
    for i, f in enumerate(ff["fields"]):
        fp = f"{p}.fields[{i}]"
        if not _is_str(f.get("label")):
            e.append(f"{fp}.label must be string")
        if not _is_str(f.get("profile_key")):
            e.append(f"{fp}.profile_key must be string")
        if not (f.get("value") is None or _is_str(f.get("value"))):
            e.append(f"{fp}.value must be string|null")
        if f.get("status") not in FIELD_STATUSES:
            e.append(f"{fp}.status invalid: {f.get('status')}")
        if "type" in f and f["type"] not in FIELD_TYPES:
            e.append(f"{fp}.type invalid: {f['type']}")
        if "required" in f and not isinstance(f["required"], bool):
            e.append(f"{fp}.required must be boolean")
    return e


def validate_checklist(cl: Any, path: str = "checklist") -> list[str]:
    if not _is_obj(cl):
        return [f"{path}: not an object"]
    e: list[str] = []
    if cl.get("vendor_type") not in VENDOR_TYPES:
        e.append(f"{path}.vendor_type invalid: {cl.get('vendor_type')}")
    steps = cl.get("steps")
    if not _is_arr(steps) or len(steps) == 0:
        e.append(f"{path}.steps must be a non-empty array")
        return e
    for i, s in enumerate(steps):
        p = f"{path}.steps[{i}]"
        if not isinstance(s.get("order"), int) or isinstance(s.get("order"), bool):
            e.append(f"{p}.order must be int")
        for key in ("agency", "title", "detail", "cite"):
            if not _is_str(s.get(key)):
                e.append(f"{p}.{key} must be string")
        if not (s.get("deadline_days") is None or (isinstance(s.get("deadline_days"), int) and not isinstance(s.get("deadline_days"), bool))):
            e.append(f"{p}.deadline_days must be int|null")
        if not (s.get("deadline_label") is None or _is_str(s.get("deadline_label"))):
            e.append(f"{p}.deadline_label must be string|null")
        if "form_url" in s and not (s["form_url"] is None or _is_str(s["form_url"])):
            e.append(f"{p}.form_url must be string|null when present")
        if "filled_form" in s and not (s["filled_form"] is None or _is_obj(s["filled_form"])):
            e.append(f"{p}.filled_form must be object|null when present")
        elif _is_obj(s.get("filled_form")):
            e.extend(_validate_filled_form(s["filled_form"], f"{p}.filled_form"))
        if s.get("status") not in STATUSES:
            e.append(f"{p}.status invalid: {s.get('status')}")
    return e


def _validate_map_action(a: dict[str, Any], p: str) -> list[str]:
    e: list[str] = []
    if not _is_str(a.get("type")):
        e.append(f"{p}.type must be string")
    if not _is_str(a.get("id")):
        e.append(f"{p}.id must be string")
    point = a.get("point")
    if not _is_obj(point) or not _is_num(point.get("lat")) or not _is_num(point.get("lng")):
        e.append(f"{p}.point must be {{lat,lng}}")
    if a.get("verdict") not in VERDICTS:
        e.append(f"{p}.verdict invalid: {a.get('verdict')}")
    if not _is_num(a.get("score")) or not (0 <= a["score"] <= 1):
        e.append(f"{p}.score must be 0..1")
    if not _is_arr(a.get("reasons")) or not all(_is_str(r) for r in a.get("reasons", [])):
        e.append(f"{p}.reasons must be string[]")
    ev = a.get("event_opportunity")
    if "event_opportunity" in a and not (ev is None or _is_obj(ev)):
        e.append(f"{p}.event_opportunity must be object|null when present")
    if _is_obj(ev):
        for key in ("event_name", "venue", "start"):
            if not _is_str(ev.get(key)):
                e.append(f"{p}.event_opportunity.{key} must be string")
        if not _is_num(ev.get("expected_attendance")):
            e.append(f"{p}.event_opportunity.expected_attendance must be number")
        if not (ev.get("event_url") is None or _is_str(ev.get("event_url"))):
            e.append(f"{p}.event_opportunity.event_url must be string|null")
        if not (ev.get("promoter_name") is None or _is_str(ev.get("promoter_name"))):
            e.append(f"{p}.event_opportunity.promoter_name must be string|null")
    od = a.get("outreach_draft")
    if "outreach_draft" in a and not (od is None or _is_obj(od)):
        e.append(f"{p}.outreach_draft must be object|null when present")
    if _is_obj(od) and (not _is_str(od.get("subject")) or not _is_str(od.get("body"))):
        e.append(f"{p}.outreach_draft must be {{subject:string, body:string}}")
    if not a.get("event_opportunity") and a.get("outreach_draft"):
        e.append(f"{p}.outreach_draft requires event_opportunity")
    b = a.get("breakdown")
    if not _is_obj(b):
        e.append(f"{p}.breakdown missing")
        return e
    if not _is_arr(b.get("constraints")):
        e.append(f"{p}.breakdown.constraints must be array")
    else:
        for j, cst in enumerate(b["constraints"]):
            cp = f"{p}.breakdown.constraints[{j}]"
            if not _is_str(cst.get("rule")):
                e.append(f"{cp}.rule must be string")
            if not _is_bool(cst.get("pass")):
                e.append(f"{cp}.pass must be bool")
            if not _is_str(cst.get("detail")):
                e.append(f"{cp}.detail must be string")
    demand = b.get("demand")
    if not _is_obj(demand) or not _is_num(demand.get("foot_traffic_score")) or not _is_str(demand.get("restaurant_saturation")):
        e.append(f"{p}.breakdown.demand must be {{foot_traffic_score:number, restaurant_saturation:string}}")
    if not _is_arr(b.get("nearby_vendors")):
        e.append(f"{p}.breakdown.nearby_vendors must be array")
    else:
        for k, nv in enumerate(b["nearby_vendors"]):
            np = f"{p}.breakdown.nearby_vendors[{k}]"
            if not _is_str(nv.get("name")):
                e.append(f"{np}.name must be string")
            if not _is_str(nv.get("cuisine")):
                e.append(f"{np}.cuisine must be string")
            if not _is_bool(nv.get("scheduled_here")):
                e.append(f"{np}.scheduled_here must be bool")
    return e


def validate_envelope(env: Any) -> list[str]:
    if not _is_obj(env):
        return ["envelope: not an object"]
    e: list[str] = []
    if env.get("agent") not in ("spot_scout", "permit_copilot"):
        e.append(f"agent invalid: {env.get('agent')}")
    if not _is_str(env.get("reply_markdown")):
        e.append("reply_markdown must be string")
    if not _is_arr(env.get("citations")):
        e.append("citations must be array")
    else:
        for i, ct in enumerate(env["citations"]):
            p = f"citations[{i}]"
            for key in ("label", "source", "quote"):
                if not _is_str(ct.get(key)):
                    e.append(f"{p}.{key} must be string")
    if not _is_arr(env.get("map_actions")):
        e.append("map_actions must be array")
    else:
        for i, a in enumerate(env["map_actions"]):
            e.extend(_validate_map_action(a, f"map_actions[{i}]"))
    if not (env.get("checklist") is None or _is_obj(env.get("checklist"))):
        e.append("checklist must be object|null")
    elif _is_obj(env.get("checklist")):
        e.extend(validate_checklist(env["checklist"]))
    if _is_arr(env.get("map_actions")) and len(env["map_actions"]) > 0 and env.get("checklist") is not None:
        e.append("both map_actions and checklist are populated (must be exactly one)")
    return e
