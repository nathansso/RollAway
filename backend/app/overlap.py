"""Menu competition-overlap CORE — pure, deterministic, no network.

Python port of agents/menu_rag/overlap.mjs. Reasons over MENU ITEMS + PRICE
POINTS, never a coarse cuisine label. Output dict shapes match the Node core
key-for-key so recommend_spots and the eval suite see an identical contract.
"""

from __future__ import annotations

from typing import Any

from .normalize import keyword_for, mock_normalize, slug

LEVEL_BAND = {1: 4, 2: 9, 3: 18, 4: 35}


def _match_tokens(item: Any) -> set[str]:
    name = item if isinstance(item, str) else (item.get("name") or item.get("item") or "")
    provided = item.get("keywords", []) if isinstance(item, dict) else []
    tokens: set[str] = set(mock_normalize(name)["keywords"])
    for keyword in provided if isinstance(provided, list) else []:
        s = slug(str(keyword))
        if s:
            tokens.add(s)
    ns = slug(str(name))
    if ns:
        tokens.add(ns)
    return tokens


def _item_price(item: Any) -> float | None:
    if not isinstance(item, dict):
        return None
    price = item.get("price", item.get("price_point"))
    return float(price) if isinstance(price, (int, float)) and not isinstance(price, bool) else None


def normalize_menu(menu: dict[str, Any]) -> dict[str, Any]:
    items = [
        {
            "name": it if isinstance(it, str) else (it.get("name") or ""),
            "tokens": _match_tokens(it),
            "price": _item_price(it),
        }
        for it in (menu.get("items") or [])
    ]
    return {
        "vendor_id": menu.get("vendor_id"),
        "vendor_name": menu.get("vendor_name"),
        "items": items,
    }


def normalize_competitor(comp: dict[str, Any]) -> dict[str, Any]:
    raw_items: list[Any] = list(comp.get("items") or [])
    if not raw_items and isinstance(comp.get("keywords"), list):
        raw_items = list(comp["keywords"])
    prices = [
        p for p in (comp.get("price_points") or [])
        if isinstance(p, (int, float)) and not isinstance(p, bool)
    ]
    price_level = comp.get("price_level") if isinstance(comp.get("price_level"), int) else None
    items = []
    for i, it in enumerate(raw_items):
        price = _item_price(it)
        if price is None and i < len(prices):
            price = float(prices[i])
        items.append({
            "name": it if isinstance(it, str) else (it.get("name") or ""),
            "tokens": _match_tokens(it),
            "price": price,
        })
    return {
        "name": comp.get("name") or "competitor",
        "items": items,
        "price_points": prices,
        "price_level": price_level,
        "level_band": LEVEL_BAND.get(price_level) if price_level is not None else None,
    }


def _price_compare(mine: float | None, theirs: float | None) -> tuple[float | None, str | None]:
    if mine is None or theirs is None:
        return None, None
    gap = round(theirs - mine, 2)
    rel = 0 if mine == 0 else gap / mine
    if abs(rel) <= 0.15:
        note = "similar price"
    elif gap < 0:
        note = "they undercut you"
    else:
        note = "you undercut them"
    return gap, note


def _verdict_for(score: float) -> str:
    if score >= 0.5:
        return "high"
    if score >= 0.2:
        return "medium"
    return "low"


def overlap_one(vendor_menu: dict[str, Any], competitor_raw: dict[str, Any]) -> dict[str, Any]:
    comp = normalize_competitor(competitor_raw)
    overlapping_items: list[dict[str, Any]] = []
    matched_my: set[int] = set()
    matched_comp: set[int] = set()

    for mi, mine in enumerate(vendor_menu["items"]):
        for ci, theirs in enumerate(comp["items"]):
            if mine["tokens"] & theirs["tokens"]:
                matched_my.add(mi)
                matched_comp.add(ci)
                their_price = theirs["price"] if theirs["price"] is not None else comp["level_band"]
                gap, note = _price_compare(mine["price"], their_price)
                shared = [t for t in mine["tokens"] if t in theirs["tokens"]]
                overlapping_items.append({
                    "my_item": mine["name"],
                    "competitor_item": theirs["name"] or (next(iter(theirs["tokens"]), "")),
                    "shared": shared,
                    "price_mine": mine["price"],
                    "price_theirs": their_price,
                    "price_gap": gap,
                    "price_note": note,
                })

    denom = len(vendor_menu["items"]) or 1
    overlap_score = round(len(matched_my) / denom, 3)
    priced = [o for o in overlapping_items if o["price_gap"] is not None]
    price_summary = "prices not comparable"
    if priced:
        avg_gap = round(sum(o["price_gap"] for o in priced) / len(priced), 2)
        if avg_gap > 0.5:
            price_summary = f"you're ~${avg_gap:.2f} cheaper on shared items"
        elif avg_gap < -0.5:
            price_summary = f"you're ~${abs(avg_gap):.2f} pricier on shared items"
        else:
            price_summary = "similar prices on shared items"

    return {
        "name": comp["name"],
        "overlap_score": overlap_score,
        "verdict": _verdict_for(overlap_score),
        "matched_my_items": len(matched_my),
        "matched_competitor_items": len(matched_comp),
        "competitor_item_count": len(comp["items"]),
        "overlapping_items": _dedupe(overlapping_items),
        "price_summary": price_summary,
    }


def _dedupe(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        key = f"{row['my_item']}||{row['competitor_item']}"
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out[:20]


def competition_overlap_core(
    menu: dict[str, Any], competitors: list[dict[str, Any]] | None
) -> dict[str, Any]:
    vendor_menu = normalize_menu(menu)
    per = [overlap_one(vendor_menu, c) for c in (competitors or [])]
    scores = [p["overlap_score"] for p in per]
    max_overlap = max(scores) if scores else 0
    mean = round(sum(scores) / len(scores), 3) if scores else 0
    most = max(per, key=lambda p: p["overlap_score"]) if per else None
    return {
        "vendor": {
            "vendor_id": vendor_menu["vendor_id"],
            "vendor_name": vendor_menu["vendor_name"],
            "menu_item_count": len(vendor_menu["items"]),
        },
        "competitors": per,
        "summary": {
            "competitor_count": len(per),
            "mean_overlap": mean,
            "max_overlap": max_overlap,
            "most_overlapping": most["name"] if most else None,
            "direct_competitors": sum(1 for p in per if p["verdict"] == "high"),
            "reasoned_over": "menu items + price points (never a cuisine label)",
        },
    }
