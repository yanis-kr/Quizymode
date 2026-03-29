# -*- coding: utf-8 -*-
"""Rewrite the local trivia progress file from taxonomy and existing trivia.*.json files."""
from __future__ import annotations

import json
from pathlib import Path

from seed_progress_paths import ensure_category_progress_dir, progress_file_path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "bulk-seed" / "trivia"
PROGRESS = progress_file_path("trivia")
TAXONOMY = ROOT / "docs" / "quizymode_taxonomy.yaml"

SKIP_L1 = {"general", "mixed"}
SKIP_L2 = {"general", "mixed", "basics", "random", "easy", "hard"}


def eligible_pairs() -> list[tuple[str, str]]:
    lines = TAXONOMY.read_text(encoding="utf-8").splitlines()
    in_trivia = False
    current_l1: str | None = None
    pairs: list[tuple[str, str]] = []

    for line in lines:
        if not in_trivia:
            if line.startswith("trivia:"):
                in_trivia = True
            continue

        if line and not line.startswith(" "):
            break

        stripped = line.strip()
        if not stripped or stripped.startswith("description:") or stripped == "keywords:":
            continue

        indent = len(line) - len(line.lstrip(" "))
        if indent == 4 and ":" in stripped:
            current_l1 = stripped.split(":", 1)[0]
            continue

        if indent != 8 or not current_l1 or ":" not in stripped:
            continue
        if current_l1 in SKIP_L1:
            continue

        l2 = stripped.split(":", 1)[0]
        if l2 in SKIP_L2 or l2.startswith("general-"):
            continue
        if current_l1 == "famous-people" and l2 == "mixed":
            continue
        pairs.append((current_l1, l2))

    return pairs


def main() -> None:
    ensure_category_progress_dir("trivia")

    rows: list[tuple[str, int, str]] = []
    for path in sorted(OUT.glob("trivia.*.json")):
        stem = path.stem.removeprefix("trivia.")
        items = json.loads(path.read_text(encoding="utf-8"))
        domains: set[str] = set()
        for item in items:
            src = item.get("source") or ""
            if "://" not in src:
                continue
            try:
                domains.add(src.split("/")[2])
            except IndexError:
                pass
        rows.append((stem, len(items), ", ".join(sorted(domains))))

    eligible = eligible_pairs()
    eligible_set = {f"{l1}.{l2}" for l1, l2 in eligible}
    existing_set = {stem for stem, _, _ in rows}
    remaining = sorted(eligible_set - existing_set)

    lines = [
        "# trivia bulk-seed progress",
        "",
        f"Eligible trivia L1/L2 pairs: **{len(eligible)}**",
        f"Existing trivia seed files: **{len(rows)}**",
        f"Remaining eligible pairs: **{len(remaining)}**",
        "",
        "## Files",
        "",
    ]
    for stem, count, domains in rows:
        slug = stem.replace(".", "/")
        lines.append(f"- `trivia.{stem}.json` | {slug} | n={count} | {domains}")

    lines.extend(["", "## Next recommended pair", ""])
    if remaining:
        lines.append(f"- `{remaining[0]}`")
    else:
        lines.append("- *(complete - no eligible pairs left)*")
    lines.append("")

    PROGRESS.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("wrote", PROGRESS, "entries", len(rows))


if __name__ == "__main__":
    main()
