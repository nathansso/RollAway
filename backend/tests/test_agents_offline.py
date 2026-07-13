"""Single-turn Spot Scout + Permit Copilot + form_fill, offline (no key):
mirrors agents/evals/run.mjs checks 16, 19-20 and the outreach-safety trio."""

import copy

import pytest

from app import agents
from app.envelope import validate_envelope

SPOT_FIXTURE = {
    "user_profile": {"vendor_type": "truck", "cuisine": "tacos", "menu_kb_id": "menu-kb-demo-el-sabor-local"},
    "candidates": [
        {
            "id": "spot-1", "point": {"lat": 37.7852, "lng": -122.3969},
            "signals": {
                "foot_traffic_score": 0.7, "restaurant_saturation": "low",
                "clearance": {"allowed": True, "checks": [
                    {"rule": "75ft from restaurant entrance", "required_ft": 75, "actual_ft": 110, "pass": True, "cite": "dpw-182101"},
                    {"rule": "7ft from hydrant", "required_ft": 7, "actual_ft": 20, "pass": True, "cite": "dpw-182101"},
                ]},
                "nearby_vendors": [{"name": "El Sabor", "cuisine": "tacos", "scheduled_here": False}],
                "competitors": [{"name": "Taqueria Cancún", "items": ["street taco", "burrito", "quesadilla"], "price_points": [3.25, 10, 8.5]}],
            },
        },
        {
            "id": "spot-2", "point": {"lat": 37.7799, "lng": -122.39},
            "signals": {
                "foot_traffic_score": 0.3, "restaurant_saturation": "high",
                "clearance": {"allowed": False, "checks": [
                    {"rule": "75ft from restaurant entrance", "required_ft": 75, "actual_ft": 50, "pass": False, "cite": "dpw-182101"},
                ]},
                "nearby_vendors": [], "competitors": [],
            },
        },
    ],
}

EVENT = {
    "event_name": "SF Giants vs Dodgers", "venue": "Oracle Park", "start": "2026-07-18T18:45:00",
    "expected_attendance": 40000, "event_url": "https://www.ticketmaster.com/event/123", "promoter_name": None,
}


@pytest.mark.asyncio
async def test_spot_scout_single_turn_offline():
    env, trace = await agents.run_spot_scout_single_turn(copy.deepcopy(SPOT_FIXTURE))
    assert validate_envelope(env) == []
    assert trace == []  # 0 tool calls — single turn
    assert env["checklist"] is None
    assert len(env["map_actions"]) == 2
    assert env["map_actions"][0]["score"] >= env["map_actions"][1]["score"]
    spot2 = next(a for a in env["map_actions"] if a["id"] == "spot-2")
    assert spot2["verdict"] == "avoid"  # fails clearance; never model math
    assert any(c["source"] == "dpw-182101" for c in env["citations"])


@pytest.mark.asyncio
async def test_menu_overlap_folded_into_signals():
    payload = copy.deepcopy(SPOT_FIXTURE)
    env, _ = await agents.run_spot_scout_single_turn(payload)
    spot1 = next(a for a in env["map_actions"] if a["id"] == "spot-1")
    assert any("Menu overlap:" in r for r in spot1["reasons"])


@pytest.mark.asyncio
async def test_no_event_means_no_outreach_field():
    env, _ = await agents.run_spot_scout_single_turn(copy.deepcopy(SPOT_FIXTURE))
    assert not any("outreach_draft" in a for a in env["map_actions"])


@pytest.mark.asyncio
async def test_event_outreach_null_promoter_uses_public_url_only():
    payload = copy.deepcopy(SPOT_FIXTURE)
    payload["candidates"][0]["event_opportunity"] = dict(EVENT)
    env, _ = await agents.run_spot_scout_single_turn(payload)
    action = next(a for a in env["map_actions"] if a["id"] == "spot-1")
    draft = action["outreach_draft"]
    assert draft, "outreach draft present with event"
    text = f"{draft['subject']} {draft['body']}"
    assert "https://www.ticketmaster.com/event/123" in text
    assert "@" not in text  # never a fabricated email
    assert "Hello event team" in text
    assert "draft you can send" in env["reply_markdown"]
    assert validate_envelope(env) == []


@pytest.mark.asyncio
async def test_permit_copilot_fast_path_offline():
    env, _ = await agents.run_permit_copilot(
        "pushcart selling ice cream, what permits?", {"vendor_type": "pushcart_nocook"}
    )
    assert validate_envelope(env) == []
    checklist = env["checklist"]
    assert checklist and checklist["vendor_type"] == "pushcart_nocook"
    assert env["map_actions"] == []
    agencies = [s["agency"].lower() for s in checklist["steps"]]
    assert "dmv" not in agencies
    assert "fire" not in agencies
    assert any(s["cite"] == "sf-sidewalk-width" for s in checklist["steps"])
    assert env["citations"], "citations from authored checklist"


@pytest.mark.asyncio
async def test_permit_copilot_slug_alias_and_truck_contrast():
    env, _ = await agents.run_permit_copilot("permits?", {"vendor_type": "pushcart_no_cook"})
    assert env["checklist"]["vendor_type"] == "pushcart_nocook"
    env2, _ = await agents.run_permit_copilot(
        "I run a taco truck, what permits and licenses do I need to get legal?", {"vendor_type": "truck"}
    )
    agencies = [s["agency"] for s in env2["checklist"]["steps"]]
    assert "DMV" in agencies and "Fire" in agencies


@pytest.mark.asyncio
async def test_hidden_clocks_survive_for_all_vendor_types():
    for vt in ("truck", "trailer", "pushcart_cooking", "pushcart_nocook"):
        env, _ = await agents.run_permit_copilot("permits?", {"vendor_type": vt})
        days = {s.get("deadline_days") for s in env["checklist"]["steps"] if s.get("deadline_days") is not None}
        assert {30, 90, 15} <= days, f"{vt} missing a hidden clock"


@pytest.mark.asyncio
async def test_form_fill_real_and_source_needed():
    profile = {"business_name": "El Sabor Taqueria", "owner_name": "Ana Ruiz", "pinned_point": {"lat": 37.7852, "lng": -122.3969}}
    real = await agents.run_form_fill({"source": "sfpw-mff", "vendor_type": "truck", "context": profile})
    assert "error" not in real
    assert real["source"] == "sfpw-mff" and isinstance(real["fields"], list)
    assert isinstance(real["summary"], str) and real["summary"]
    business = next(f for f in real["fields"] if f["profile_key"] == "business_name")
    assert business["value"] == "El Sabor Taqueria"
    bad = await agents.run_form_fill({"source": "ttx-cert", "context": profile})
    assert bad["error"]["code"] == "BAD_INPUT"


def test_extract_envelope_tolerates_fences_and_prose():
    assert agents.extract_envelope('prose ```json\n{"a": 1}\n``` more') == {"a": 1}
    assert agents.extract_envelope('noise {"a": {"b": "}"}} trailing') == {"a": {"b": "}"}}
    assert agents.extract_envelope("no json here") is None
    assert agents.extract_envelope(None) is None
