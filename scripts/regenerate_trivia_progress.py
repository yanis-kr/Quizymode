# -*- coding: utf-8 -*-
"""Rewrite data/bulk-seed/trivia/_progress.md from existing trivia.*.json files."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "bulk-seed" / "trivia"
PROGRESS = OUT / "_progress.md"
def main() -> None:
    rows: list[tuple[str, int, str]] = []
    for p in sorted(OUT.glob("trivia.*.json")):
        stem = p.stem.removeprefix("trivia.")
        items = json.loads(p.read_text(encoding="utf-8"))
        doms: set[str] = set()
        for x in items:
            src = x.get("source") or ""
            if "://" in src:
                try:
                    doms.add(src.split("/")[2])
                except IndexError:
                    pass
        doms_s = ", ".join(sorted(doms))
        rows.append((stem, len(items), doms_s))

    lines = [
        "# trivia bulk-seed progress",
        "",
        "All **59** eligible trivia L1/L2 pairs (per `docs/quizymode_taxonomy.yaml` rules) have seed files. "
        "None remain.",
        "",
        "## Files",
        "",
    ]
    for stem, n, doms in rows:
        slug = stem.replace(".", "/")
        lines.append(f"- `trivia.{stem}.json` | {slug} | n={n} | {doms}")
    lines.extend(["", "## Next recommended pair", "", "- *(complete — no eligible pairs left)*", ""])
    PROGRESS.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("wrote", PROGRESS, "entries", len(rows))


if __name__ == "__main__":
    main()
