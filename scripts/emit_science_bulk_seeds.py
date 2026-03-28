# -*- coding: utf-8 -*-
"""Emit missing science.*.json seed files from scripts/science_data/<l1>.json banks.

Each bank file maps L2 slug -> list of item dicts with:
  question, correctAnswer, incorrectAnswers, explanation, keywords, source

The emitter adds seedId (UUID v4), category, navigationKeyword1, navigationKeyword2.
Skips pairs that already have a file (does not overwrite).
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "scripts" / "science_data"
OUT = ROOT / "data" / "bulk-seed" / "science"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    created = 0
    for path in sorted(DATA_DIR.glob("*.json")):
        l1 = path.stem
        bank = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(bank, dict):
            raise ValueError(f"{path}: expected JSON object keyed by L2")
        for l2, items in sorted(bank.items()):
            out_path = OUT / f"science.{l1}.{l2}.json"
            if out_path.exists():
                continue
            if not isinstance(items, list) or len(items) < 12:
                raise ValueError(f"{path} [{l2}]: need a list of at least 12 items, got {type(items)}")
            payload: list[dict] = []
            for raw in items[:15]:
                if not isinstance(raw, dict):
                    raise ValueError(f"{path} [{l2}]: item must be object")
                for k in (
                    "question",
                    "correctAnswer",
                    "incorrectAnswers",
                    "explanation",
                    "keywords",
                    "source",
                ):
                    if k not in raw:
                        raise ValueError(f"{path} [{l2}]: missing {k}")
                row = {
                    "seedId": str(uuid.uuid4()),
                    "category": "science",
                    "navigationKeyword1": l1,
                    "navigationKeyword2": l2,
                    "question": raw["question"],
                    "correctAnswer": raw["correctAnswer"],
                    "incorrectAnswers": raw["incorrectAnswers"],
                    "explanation": raw["explanation"],
                    "keywords": raw["keywords"],
                    "source": raw["source"],
                }
                payload.append(row)
            out_path.write_text(
                json.dumps(payload, ensure_ascii=True, indent=2) + "\n",
                encoding="utf-8",
            )
            created += 1
    print("created", created, "files under", OUT)


if __name__ == "__main__":
    main()
