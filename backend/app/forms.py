"""Deterministic permit-form lookup and defense-in-depth URL validation.

Python port of agents/runtime/forms.mjs. The authored markdown tables in
agents/kb (FORMS.md, FORM_FIELDS.md) remain the single source of truth.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

FORM_DOMAIN_ALLOWLIST = (
    "sf.gov", "www.sf.gov",
    "sfpublicworks.org", "www.sfpublicworks.org",
    "sf-fire.org", "www.sf-fire.org",
    "sfdph.org", "www.sfdph.org",
    "sftreasurer.org", "www.sftreasurer.org",
)

FIELD_TYPES = ("text", "email", "tel", "date", "number", "select", "textarea")

_SOURCE_ID_RE = re.compile(r"^[a-z0-9-]+$")
_PROFILE_KEY_RE = re.compile(r"^[a-z0-9_]+$")


def is_allowed_form_url(value: Any) -> bool:
    try:
        url = urlparse(str(value))
    except ValueError:
        return False
    return url.scheme == "https" and (url.hostname or "").lower() in FORM_DOMAIN_ALLOWLIST


def _cells(line: str) -> list[str]:
    parts = line.split("|")[1:-1]
    return [cell.strip().strip("`") for cell in parts]


def parse_forms_table(markdown: str) -> dict[str, dict[str, str]]:
    forms: dict[str, dict[str, str]] = {}
    for line in (markdown or "").splitlines():
        cells = _cells(line)
        if len(cells) < 5 or not _SOURCE_ID_RE.match(cells[0]) or re.match(r"^-+$", cells[0]) or cells[0] == "source":
            continue
        forms[cells[0]] = {
            "source": cells[0], "agency": cells[1], "form": cells[2], "form_url": cells[3],
        }
    return forms


def parse_form_fields_table(markdown: str) -> dict[str, list[dict[str, Any]]]:
    fields: dict[str, list[dict[str, Any]]] = {}
    for line in (markdown or "").splitlines():
        cells = _cells(line)
        if len(cells) < 3 or not _SOURCE_ID_RE.match(cells[0]) or re.match(r"^-+$", cells[0]) or cells[0] == "source":
            continue
        cite, profile_key, label = cells[0], cells[1], cells[2]
        raw_type = cells[3] if len(cells) > 3 else ""
        raw_required = cells[4] if len(cells) > 4 else ""
        if not _PROFILE_KEY_RE.match(profile_key) or not label:
            continue
        field_type = raw_type if raw_type in FIELD_TYPES else "text"
        required = (
            not re.match(r"^(no|false|optional)$", raw_required, re.IGNORECASE)
            if raw_required else True
        )
        fields.setdefault(cite, []).append({
            "profile_key": profile_key, "label": label, "type": field_type, "required": required,
        })
    return fields


def format_field_value(profile: dict[str, Any] | None, key: str) -> str | None:
    value = (profile or {}).get(key)
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, dict):
        lat, lng = value.get("lat"), value.get("lng")
        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            return f"{_num(lat)}, {_num(lng)}"
        return None
    if isinstance(value, (int, float)):
        return _num(value)
    if isinstance(value, str):
        return value
    return None


def _num(value: float) -> str:
    """Format numbers the way JS string-interpolation does (no trailing .0)."""
    if isinstance(value, int) or float(value).is_integer():
        return str(int(value))
    return repr(float(value))


def resolve_form_url(cite: str | None, forms: dict[str, dict[str, str]]) -> str | None:
    value = (forms.get(cite or "") or {}).get("form_url")
    if not value or value == "SOURCE-NEEDED":
        return None
    if not is_allowed_form_url(value):
        return None
    return value


def build_filled_form(
    cite: str,
    forms: dict[str, dict[str, str]],
    form_fields: dict[str, list[dict[str, Any]]] | None,
    profile: dict[str, Any] | None,
) -> dict[str, Any] | None:
    form_url = resolve_form_url(cite, forms)
    if not form_url:
        return None
    meta = forms.get(cite)
    specs = (form_fields or {}).get(cite)
    if not meta or not specs:
        return None
    fields = []
    for spec in specs:
        value = format_field_value(profile, spec["profile_key"])
        fields.append({
            "label": spec["label"],
            "profile_key": spec["profile_key"],
            "type": spec.get("type", "text"),
            "required": spec.get("required", True),
            "value": value,
            "status": "unknown" if value is None else "filled",
        })
    return {"agency": meta["agency"], "form": meta["form"], "form_url": form_url, "fields": fields}


def build_form_schema(
    cite: str,
    forms: dict[str, dict[str, str]],
    form_fields: dict[str, list[dict[str, Any]]] | None,
    profile: dict[str, Any] | None,
) -> dict[str, Any] | None:
    filled = build_filled_form(cite, forms, form_fields, profile)
    if not filled:
        return None
    required_open = sum(1 for f in filled["fields"] if f["required"] and f["status"] == "unknown")
    optional_open = sum(1 for f in filled["fields"] if not f["required"] and f["status"] == "unknown")
    return {"source": cite, **filled, "required_open": required_open, "optional_open": optional_open}


def attach_form_urls(
    checklist: dict[str, Any] | None,
    forms: dict[str, dict[str, str]],
    form_fields: dict[str, list[dict[str, Any]]] | None = None,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if not checklist or not isinstance(checklist.get("steps"), list):
        return checklist
    steps = []
    for step in checklist["steps"]:
        out = {**step, "form_url": resolve_form_url(step.get("cite"), forms)}
        if form_fields is not None:
            out["filled_form"] = build_filled_form(step.get("cite", ""), forms, form_fields, profile)
        steps.append(out)
    return {**checklist, "steps": steps}
