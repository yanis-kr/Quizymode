# -*- coding: utf-8 -*-
"""Rewrite the local science progress file from taxonomy and existing science.*.json files."""
from __future__ import annotations

import json
from pathlib import Path

from seed_progress_paths import ensure_category_progress_dir, progress_file_path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "seed-source" / "items" / "science"
PROGRESS = progress_file_path("science")
TAXONOMY = ROOT / "docs" / "quizymode_taxonomy.yaml"

# Match `data/prompts/science.md` strict rule defaults.
SKIP_L1 = {"general", "mixed"}
SKIP_L2 = {"general", "mixed", "basics", "review"}


def eligible_pairs() -> list[tuple[str, str]]:
    lines = TAXONOMY.read_text(encoding="utf-8").splitlines()
    in_science = False
    current_l1: str | None = None
    pairs: list[tuple[str, str]] = []

    for line in lines:
        if not in_science:
            if line.startswith("science:"):
                in_science = True
            continue

        # stop when we leave the `science:` top-level block
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

        if current_l1 in SKIP_L1 or current_l1.startswith("general-"):
            continue

        l2 = stripped.split(":", 1)[0]
        if l2 in SKIP_L2 or l2.startswith("general-"):
            continue
        pairs.append((current_l1, l2))

    return pairs


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ensure_category_progress_dir("science")

    rows: list[tuple[str, int, str]] = []
    for path in sorted(OUT.glob("science.*.json")):
        stem = path.stem.removeprefix("science.")
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
        "# science seed-source progress",
        "",
        f"Eligible science L1/L2 pairs: **{len(eligible)}**",
        f"Existing science seed files: **{len(rows)}**",
        f"Remaining eligible pairs: **{len(remaining)}**",
        "",
        "## Files",
        "",
    ]
    if rows:
        for stem, count, domains in rows:
            slug = stem.replace(".", "/")
            lines.append(f"- `science.{stem}.json` | {slug} | n={count} | {domains}")
    else:
        lines.append("*(none yet)*")

    lines.extend(["", "## Next recommended pair", ""])
    if remaining:
        lines.append(f"- `{remaining[0].replace('.', '/')}`")
    else:
        lines.append("- *(complete - no eligible pairs left)*")
    lines.append("")

    PROGRESS.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("wrote", PROGRESS, "entries", len(rows))


if __name__ == "__main__":
    main()

