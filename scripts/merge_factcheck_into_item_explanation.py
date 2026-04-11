"""
Append factChecks[0].explanation + source URL to item explanation with UPD260411 prefix.
Idempotent: skips items whose explanation already contains 'UPD260411:'.
Run from repo root: python scripts/merge_factcheck_into_item_explanation.py
"""
from __future__ import annotations

import json
import re
import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GLOB = str(ROOT / "data/seed-source/items/exams/exams.aws.saa-c03-p*.json")
MARKER = "UPD260411:"


def natural_sort(paths: list[str]) -> list[str]:
    return sorted(paths, key=lambda p: int(re.search(r"p(\d+)", p).group(1)))


def process_item(item: dict) -> bool:
    if MARKER in (item.get("explanation") or ""):
        return False
    fcs = item.get("factChecks") or []
    if not fcs:
        return False
    fc0 = fcs[0]
    if not isinstance(fc0, dict):
        return False
    fc_exp = (fc0.get("explanation") or "").strip()
    fc_src = (fc0.get("source") or "").strip()
    if not fc_exp or not fc_src:
        return False
    base = (item.get("explanation") or "").rstrip()
    addition = f"\n{MARKER} {fc_exp} ({fc_src})"
    item["explanation"] = base + addition

    # Align conclusion when item body documents an answer correction
    expl = item.get("explanation") or ""
    if "prior keyed answer" in expl.lower() and fc0.get("conclusion") == "correct":
        fc0["conclusion"] = "incorrect_fixed"
    return True


def main() -> None:
    files = natural_sort(glob.glob(GLOB))
    total = 0
    for fp in files:
        p = Path(fp)
        data = json.loads(p.read_text(encoding="utf-8"))
        n = 0
        for item in data:
            if isinstance(item, dict) and process_item(item):
                n += 1
        if n:
            p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        total += n
        print(p.name, n)
    print("updated", total)


if __name__ == "__main__":
    main()
