#!/usr/bin/env python3
"""Recompute keywords on exams.aws.saa-c03*.json using scripts/saa_c03_keywords.py."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from saa_c03_keywords import (  # noqa: E402
    SAA_C03_SEED_SOURCE,
    infer_saa_c03_keywords,
)

EXAMS_DIR = ROOT / "data" / "bulk-seed" / "exams"


def main() -> None:
    paths = sorted(EXAMS_DIR.glob("exams.aws.saa-c03*.json"))
    if not paths:
        raise SystemExit("No exams.aws.saa-c03*.json found")
    for path in paths:
        items = json.loads(path.read_text(encoding="utf-8"))
        for it in items:
            it["keywords"] = infer_saa_c03_keywords(
                it.get("question", ""),
                it.get("correctAnswer", ""),
                it.get("incorrectAnswers") or [],
            )
            it["source"] = SAA_C03_SEED_SOURCE
        path.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(path.name, len(items), "items")


if __name__ == "__main__":
    main()
