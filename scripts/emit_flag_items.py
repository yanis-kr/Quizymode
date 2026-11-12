"""Emit the geography > flags picture items (#407 PR 2, issue #617).

Reads scripts/flag_country_data.py (names, regions, designs, starter wow lines, kept countries),
scripts/flag_explanations.json (per-flag explanation and fact source) and
data/curated-media/flags/manifest.json (picture provenance check), then writes:

- geography.flags.countries.json: the KEPT_COUNTRIES flags (navigationKeyword2 "countries");
- geography.flags.mixed.NNN.json: every other flag (navigationKeyword2 "mixed"), in 100-item chunks.

Sets of 100 items or fewer use a single unsuffixed file, per AGENTS.md. The hand-written trivia items that
used to sit in these files are not emitted, so running the script removes them from the source tree.

Deterministic: item IDs are uuid5 over a fixed namespace and the iso2 code, and wrong answers are chosen with
a fixed hash order, so running the script twice produces identical files.

Run: python scripts/emit_flag_items.py
Then: python scripts/build_item_registry.py
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import uuid
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from flag_country_data import COUNTRIES, KEPT_COUNTRIES, SIMILAR_GROUPS, STARTER  # noqa: E402
from seed_source_common import (  # noqa: E402
    ROOT,
    SOURCE_ITEMS_ROOT,
    answer_in_alt_text,
    write_json,
)

FLAG_NAMESPACE = uuid.UUID("5e6f1c1a-4b7d-4a3e-9d2c-407f1a9c0de1")
QUESTION = "Which country's flag is this?"
SCOPE_DIR = SOURCE_ITEMS_ROOT / "geography"
KEPT_PREFIX = "geography.flags.countries"
MIXED_PREFIX = "geography.flags.mixed"
CHUNK_SIZE = 100
MANIFEST_PATH = ROOT / "data" / "curated-media" / "flags" / "manifest.json"
EXPLANATIONS_PATH = SCRIPTS_DIR / "flag_explanations.json"
WRONG_ANSWER_COUNT = 3


def item_id_for(iso2: str) -> str:
    return str(uuid.uuid5(FLAG_NAMESPACE, f"flag-country:{iso2}"))


def stable_rank(iso2: str, other: str) -> str:
    return hashlib.sha256(f"{FLAG_NAMESPACE}:{iso2}:{other}".encode("utf-8")).hexdigest()


def choose_wrong_answers(iso2: str, region: str, regions: dict[str, str]) -> list[str]:
    """Same-region countries only: look-alikes first (SIMILAR_GROUPS), then a fixed hash order."""
    chosen: list[str] = []
    for group in SIMILAR_GROUPS:
        if iso2 not in group:
            continue
        for other in group:
            if other != iso2 and regions.get(other) == region and other not in chosen:
                chosen.append(other)
    rest = sorted(
        (code for code, code_region in regions.items() if code_region == region and code != iso2 and code not in chosen),
        key=lambda code: stable_rank(iso2, code),
    )
    # Look-alikes are ranked by the hash too so that large groups do not always show the same three.
    chosen.sort(key=lambda code: stable_rank(iso2, code))
    return (chosen + rest)[:WRONG_ANSWER_COUNT]


def build_flag_items() -> list[dict]:
    """Kept countries first, then the moved flags; each group sorted by country name."""
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    by_iso = {entry["iso2"]: entry for entry in manifest["entries"]}
    explanations = json.loads(EXPLANATIONS_PATH.read_text(encoding="utf-8"))
    names = {row[0]: row[1] for row in COUNTRIES}
    regions = {row[0]: row[2] for row in COUNTRIES}

    unknown_starter = set(STARTER) - set(names)
    if unknown_starter:
        raise SystemExit(f"STARTER has unknown iso2 codes: {sorted(unknown_starter)}")
    unknown_kept = KEPT_COUNTRIES - set(names)
    if unknown_kept:
        raise SystemExit(f"KEPT_COUNTRIES has unknown iso2 codes: {sorted(unknown_kept)}")

    kept: list[dict] = []
    moved: list[dict] = []
    for iso2, name, region, _commons_file, design in sorted(COUNTRIES, key=lambda row: row[1].casefold()):
        entry = by_iso.get(iso2)
        if entry is None or entry["country"] != name or entry["region"] != region:
            raise SystemExit(f"{iso2}: manifest entry is missing or does not match flag_country_data.py")
        if answer_in_alt_text(name, design):
            raise SystemExit(f"{iso2}: design text must not contain the country name")
        fact = explanations.get(iso2)
        if fact is None or fact["name"] != name or not fact["explanation"] or not fact["source"]:
            raise SystemExit(f"{iso2}: flag_explanations.json entry is missing, mismatched or incomplete")

        is_kept = iso2 in KEPT_COUNTRIES
        item = {
            "itemId": item_id_for(iso2),
            "category": "geography",
            "navigationKeyword1": "flags",
            "navigationKeyword2": "countries" if is_kept else "mixed",
            "question": QUESTION,
            "correctAnswer": name,
            "incorrectAnswers": [names[code] for code in choose_wrong_answers(iso2, region, regions)],
            "explanation": fact["explanation"],
            "keywords": [region],
            "source": fact["source"],
            "questionImage": {"key": f"curated:flags/{iso2}", "altText": design},
        }
        if iso2 in STARTER:
            wow_line = STARTER[iso2]
            if len(wow_line) > 140 or any(len(a) > 30 for a in [name, *item["incorrectAnswers"]]):
                raise SystemExit(f"{iso2}: starter wowLine must be <= 140 chars and every answer <= 30 chars")
            item["starterWorld"] = "flags"
            item["wowLine"] = wow_line
        (kept if is_kept else moved).append(item)
    return kept + moved


def write_scope(prefix: str, items: list[dict]) -> list[str]:
    if len(items) <= CHUNK_SIZE:
        path = SCOPE_DIR / f"{prefix}.json"
        write_json(path, items)
        return [path.name]
    names = []
    for number, start in enumerate(range(0, len(items), CHUNK_SIZE), start=1):
        path = SCOPE_DIR / f"{prefix}.{number:03d}.json"
        write_json(path, items[start : start + CHUNK_SIZE])
        names.append(path.name)
    return names


def main() -> int:
    flags = build_flag_items()
    kept = [item for item in flags if item["navigationKeyword2"] == "countries"]
    moved = [item for item in flags if item["navigationKeyword2"] == "mixed"]
    if len(kept) != len(KEPT_COUNTRIES):
        raise SystemExit(f"expected {len(KEPT_COUNTRIES)} kept flags, built {len(kept)}")

    for stale in [*SCOPE_DIR.glob(f"{KEPT_PREFIX}*.json"), *SCOPE_DIR.glob(f"{MIXED_PREFIX}*.json")]:
        stale.unlink()

    written = write_scope(KEPT_PREFIX, kept) + write_scope(MIXED_PREFIX, moved)
    assert re.fullmatch(r"[0-9a-f-]{36}", flags[0]["itemId"])
    print(f"Wrote {len(kept)} countries and {len(moved)} mixed flags to {', '.join(written)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
