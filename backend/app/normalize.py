"""fooditems normalization — Python port of agents/enrichment/normalize_fooditems.mjs
(mockNormalize + keyword canon). The overlap core tokenizes competitor items
with exactly this logic so backend results match the Node enrichment pipeline
(no drift)."""

from __future__ import annotations

import re

SEP_RE = re.compile(r"\s*(?::|;|,|/|\||\n|\r|\+|&|\band\b|\bwith\b|\bplus\b)\s*", re.IGNORECASE)

FILLER = {
    "assorted", "various", "etc", "and", "more", "misc", "miscellaneous", "prepackaged",
    "pre-packaged", "packaged", "the", "a", "an", "of", "or", "other", "others", "",
}


def _singular(word: str) -> str:
    if re.search(r"(ss|us|is)$", word):
        return word
    if word.endswith("ies"):
        return word[:-3] + "y"
    if re.search(r"(ches|shes|xes|ses)$", word):
        return word[:-2]
    if word.endswith("s"):
        return word[:-1]
    return word


def _clean_item(chunk: str) -> str | None:
    words = [
        w
        for w in re.sub(r"[^a-z0-9\s'-]", " ", str(chunk).lower()).split()
        if w and w not in FILLER
    ]
    if not words:
        return None
    words[-1] = _singular(words[-1])
    label = " ".join(words).strip()
    return label or None


def slug(label: str) -> str:
    return re.sub(r"^_|_$", "", re.sub(r"[^a-z0-9]+", "_", str(label).lower()))


KEYWORD_CANON: list[tuple[re.Pattern[str], str]] = [
    (re.compile(p), k)
    for p, k in [
        (r"\bhot ?dog\b|\bcorn ?dog\b|frankfurter|sausage", "hot_dog"),
        (r"\btaco", "taco"),
        (r"\bburrito|\bmexican\b", "burrito"),
        (r"\bquesadilla", "quesadilla"),
        (r"\bnacho", "nachos"),
        (r"\belote|street corn|\bcorn\b", "elote"),
        (r"\bburger|hamburger|cheeseburger|slider", "burger"),
        (r"\bpizza|calzone", "pizza"),
        (r"\bsandwich|\bsub\b|panini|hoagie|cheesesteak|\bwrap\b|\bdeli\b", "sandwich"),
        (r"\bcoffee|espresso|latte|cappucc|mocha|americano", "coffee"),
        (r"\btea\b|chai|boba|bubble tea", "tea"),
        (r"ice ?cream|gelato|popsicle|paleta|shave ?ice|snow ?cone|sorbet|frozen yogurt", "ice_cream"),
        (r"\bwater\b", "water"),
        (r"\bsoda\b|soft drink|pop\b|cola", "soda"),
        (r"\bjuice|lemonade|agua|horchata|smoothie", "juice"),
        (r"\bchip|crisp", "chips"),
        (r"\bcandy|churro|donut|doughnut|cookie|\bcake\b|pastr|funnel|waffle|crepe|dessert", "dessert"),
        (r"\bnoodle|ramen|\bpho\b|dumpling|\bwok\b|fried rice|teriyaki|\bcurry\b", "asian_dish"),
        (r"\bsushi|poke|\bfish\b|shrimp|\bcrab\b|lobster|oyster|ceviche|seafood", "seafood_dish"),
        (r"\bbbq|barbe?cue|\brib\b|brisket|pulled pork|smoked", "bbq"),
        (r"\bhalal", "halal"),
        (r"\bkabob|kebab|shawarma|gyro|falafel", "middle_eastern"),
        (r"\bsalad", "salad"),
        (r"\bfrie|french fr", "fries"),
    ]
]


def keyword_for(label: str) -> str:
    for pattern, keyword in KEYWORD_CANON:
        if pattern.search(label):
            return keyword
    return slug(label)


def mock_normalize(raw: str | None) -> dict[str, list[str]]:
    if not raw or not str(raw).strip():
        return {"items": [], "keywords": []}
    items: list[str] = []
    keywords: list[str] = []
    seen_item: set[str] = set()
    seen_kw: set[str] = set()
    for chunk in SEP_RE.split(str(raw)):
        label = _clean_item(chunk)
        if not label or label in seen_item:
            continue
        seen_item.add(label)
        items.append(label)
        kw = keyword_for(label)
        if kw and kw not in seen_kw:
            seen_kw.add(kw)
            keywords.append(kw)
        if len(items) >= 12:
            break
    return {"items": items, "keywords": keywords}
