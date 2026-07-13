"""Ported overlap-core cases from agents/evals/run.mjs check 17 and the
Node demo fixtures — the §B menu-overlap contract for the Python rewrite."""

import json
from pathlib import Path

from app.normalize import mock_normalize
from app.overlap import competition_overlap_core

AGENTS = Path(__file__).resolve().parents[2] / "agents"

DEMO_COMPETITORS = [
    {"name": "Taqueria Cancún", "items": ["street taco", "carne asada burrito", "quesadilla", "chips and guacamole"], "price_points": [3.25, 10.0, 8.5, 6.0]},
    {"name": "La Torta Gorda", "items": ["torta", "taco", "horchata", "jarritos"], "price_points": [11.0, 3.75, 3.5, 3.0]},
    {"name": "Blue Bottle Coffee", "items": ["latte", "cold brew", "croissant", "pastry"], "price_points": [5.5, 5.0, 4.5, 4.0]},
    {"name": "The Halal Guys", "items": ["chicken over rice", "gyro", "falafel"], "price_level": 2},
]


def demo_menu():
    return json.loads((AGENTS / "menu_rag" / "menu.demo.json").read_text(encoding="utf-8"))


def test_items_and_prices_never_cuisine():
    result = competition_overlap_core(demo_menu(), DEMO_COMPETITORS)
    taqueria = next(c for c in result["competitors"] if "Cancún" in c["name"])
    coffee = next(c for c in result["competitors"] if "Coffee" in c["name"])
    assert taqueria["overlap_score"] > 0, "taqueria should overlap the taco menu"
    assert coffee["overlap_score"] == 0, "coffee shop should have ~0 menu overlap"
    assert any(
        o["my_item"] and o["competitor_item"]
        for c in result["competitors"]
        for o in c["overlapping_items"]
    ), "overlaps carry item pairs"
    assert "never a cuisine label" in result["summary"]["reasoned_over"]
    assert any(
        o["price_gap"] is not None
        for c in result["competitors"]
        for o in c["overlapping_items"]
    ), "price comparison present"


def test_summary_shape_and_most_overlapping():
    result = competition_overlap_core(demo_menu(), DEMO_COMPETITORS)
    summary = result["summary"]
    assert summary["competitor_count"] == 4
    assert 0 <= summary["mean_overlap"] <= 1
    assert summary["max_overlap"] > 0
    assert summary["most_overlapping"] in {"Taqueria Cancún", "La Torta Gorda"}
    assert isinstance(summary["direct_competitors"], int)


def test_keyword_only_competitor_and_price_level_band():
    menu = {"vendor_id": "v1", "items": [{"name": "chicken gyro", "price": 9.0}]}
    result = competition_overlap_core(menu, [{"name": "Halal Cart", "keywords": ["gyro"], "price_level": 2}])
    comp = result["competitors"][0]
    assert comp["overlap_score"] == 1.0
    assert comp["overlapping_items"][0]["price_theirs"] == 9  # level 2 band midpoint
    assert comp["overlapping_items"][0]["price_note"] == "similar price"


def test_price_notes():
    menu = {"items": [{"name": "taco", "price": 3.0}]}
    undercut = competition_overlap_core(menu, [{"name": "X", "items": [{"name": "taco", "price": 5.0}]}])
    assert undercut["competitors"][0]["overlapping_items"][0]["price_note"] == "you undercut them"
    they = competition_overlap_core(menu, [{"name": "X", "items": [{"name": "taco", "price": 2.0}]}])
    assert they["competitors"][0]["overlapping_items"][0]["price_note"] == "they undercut you"


def test_empty_menu_and_competitors():
    result = competition_overlap_core({"items": []}, [])
    assert result["summary"]["competitor_count"] == 0
    assert result["summary"]["max_overlap"] == 0
    assert result["summary"]["most_overlapping"] is None


def test_mock_normalize_matches_node_semantics():
    n = mock_normalize("Hot Dogs: Chips: Soda / Bottled Water")
    assert n["items"], "items non-empty"
    assert "hot_dog" in n["keywords"]
    assert "hot dog" in n["items"]
    assert mock_normalize("") == {"items": [], "keywords": []}
    # dedupe + 12-item cap
    many = mock_normalize(":".join(f"item{i}" for i in range(20)))
    assert len(many["items"]) == 12
