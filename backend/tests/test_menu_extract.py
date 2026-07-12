"""Menu parsing port — mirrors the Node parser checks (deterministic mock
path + the hallucinated-price guardrail) against the shared fixtures."""

import json
from pathlib import Path

import pytest

from app.menu_extract import assert_public_url, mock_parse, parse_menu_text, to_plain_text, verify_prices_in_source

FIXTURES = Path(__file__).resolve().parents[2] / "agents" / "menu_rag" / "fixtures"


@pytest.mark.asyncio
async def test_raw_text_matches_expected_ingest_shape():
    raw = (FIXTURES / "raw_menu_el_sabor.txt").read_text(encoding="utf-8")
    expected = json.loads((FIXTURES / "parsed_el_sabor.expected.json").read_text(encoding="utf-8"))
    parsed = await parse_menu_text(text=raw, vendor_id="el-sabor", vendor_type="truck", mock=True)
    assert parsed == expected


def test_hallucinated_price_dropped():
    kept = verify_prices_in_source("Taco $4.50", [{"name": "Taco", "keywords": ["taco"], "price": 99.99}])
    assert kept == []


def test_traceable_price_kept():
    kept = verify_prices_in_source("Taco $4.50", [{"name": "Taco", "keywords": ["Taco "], "price": 4.5}])
    assert kept == [{"name": "Taco", "keywords": ["taco"], "price": 4.5}]


def test_mock_parse_lines():
    parsed = mock_parse("Carne Asada Taco - $4.50\nHorchata $3\nnot a menu line")
    assert [i["name"] for i in parsed["items"]] == ["Carne Asada Taco", "Horchata"]
    assert parsed["items"][0]["price"] == 4.5


def test_plain_text_format():
    assert to_plain_text([{"name": "Taco", "price": 4.5}, {"name": "Agua", "price": 3.0}]) == (
        "Taco — $4.50\nAgua — $3"
    )


def test_ssrf_guard():
    assert_public_url("https://example.com/menu")
    for bad in (
        "http://localhost/x", "http://127.0.0.1/x", "http://10.0.0.5/x",
        "http://192.168.1.1/x", "http://169.254.1.1/x", "http://172.16.0.1/x",
        "ftp://example.com/x", "http://foo.local/x",
    ):
        with pytest.raises(ValueError):
            assert_public_url(bad)
