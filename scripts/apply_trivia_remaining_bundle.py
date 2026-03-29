# -*- coding: utf-8 -*-
"""Write trivia.*.json files from scripts/trivia_remaining_bundle.json."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "scripts" / "trivia_remaining_bundle.json"
OUT = ROOT / "data" / "seed-source" / "items" / "trivia"


def main() -> None:
    data = json.loads(BUNDLE.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    keys = sorted(data.keys())
    for k in keys:
        l1, l2 = k.split("|", 1)
        items = data[k]
        path = OUT / f"trivia.{l1}.{l2}.json"
        path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    regen_path = ROOT / "scripts" / "regenerate_trivia_progress.py"
    spec = importlib.util.spec_from_file_location("regenerate_trivia_progress", regen_path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    print("wrote", len(keys), "json files from bundle")
    mod.main()


if __name__ == "__main__":
    main()
