#!/usr/bin/env python3
"""
Build saa_c03_extract_answer_key.json from cloned 77629296/aws-certified-solutions-architect-associate-saa-c03.

Strategy (English lines only; strips CJK):
1. If exactly one of A–D has a non-empty "Explain:" section, use that letter.
2. Otherwise pick the letter with the longest Explain section (ties broken by fewer NEG hits).

Usage:
  git clone --depth 1 https://github.com/77629296/aws-certified-solutions-architect-associate-saa-c03.git %TEMP%/saa-c03-gh
  python scripts/build_saa_c03_answer_key_from_github.py %TEMP%/saa-c03-gh
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from convert_saa_c03_extract import (  # noqa: E402
    EXTRACT_PATH,
    OUT_DIR,
    parse_extract,
    eligible,
)

ANSWER_KEY_OUT = OUT_DIR / "saa_c03_extract_answer_key.json"

NEG = re.compile(
    r"\b(incorrect|wrong|not\s+(the\s+)?(?:best|correct|ideal|suitable)|"
    r"don'?t\s+need|do\s+not\s+need|not\s+related|remove\s+[A-D])\b",
    re.I,
)
MULTI_HINT = re.compile(r"choose\s+two|choose\s+three", re.I)

EXPLICIT_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"Correct Answer\s+([A-D])\b", re.I),
    re.compile(r"The correct answer is\s+([A-D])\b", re.I),
    re.compile(r"option\s+([A-D])\s+is the correct answer", re.I),
    re.compile(r"Therefore, option\s+([A-D])\b", re.I),
    re.compile(r"Therefore, option\s+([A-D])\s+with", re.I),
    re.compile(r"Choose\s+([A-D])\s*\.\s*$", re.M),
    re.compile(r"\banswer is\s+([A-D])\b", re.I),
    re.compile(r"\b([A-D])\s+is the correct answer\b", re.I),
]

# Applied after explicit + heuristic (published exam keys / consensus).
OVERRIDES: dict[int, str] = {
    3: "A",
    2: "C",
    4: "A",
    6: "B",
    7: "D",
    8: "B",
    10: "B",
    12: "A",
    14: "C",
    15: "C",
    16: "B",
    17: "A",
}


def strip_cjk(text: str) -> str:
    """Remove CJK characters but keep English fragments (repo interleaves CN on same lines)."""
    lines = []
    for line in text.splitlines():
        cleaned = re.sub(r"[\u4e00-\u9fff]+", " ", line)
        cleaned = " ".join(cleaned.split())
        if cleaned:
            lines.append(cleaned)
    return "\n".join(lines)


def option_explains(md_text: str) -> dict[str, str]:
    """English-only: map A–D to full Explain body (may be empty)."""
    text = strip_cjk(md_text)
    sections = re.split(r"\n(?=[A-D]\.\s)", text)
    out: dict[str, str] = {x: "" for x in "ABCD"}
    for sec in sections:
        sec = sec.strip()
        m = re.match(r"^([A-D])\.\s+(.+)$", sec, re.S)
        if not m:
            continue
        letter, body = m.group(1), m.group(2)
        ex_m = re.search(r"(?is)Explain:\s*(.+)$", body)
        if ex_m:
            out[letter] = ex_m.group(1).strip()
    return out


def find_md(repo: Path, n: int) -> Path | None:
    name = f"{n:03d}.md"
    hits = list(repo.rglob(name))
    return hits[0] if hits else None


def explicit_letter(md_text: str) -> str | None:
    eng = strip_cjk(md_text)
    for pat in EXPLICIT_PATTERNS:
        m = pat.search(eng)
        if m:
            return m.group(1).upper()
    return None


def pick_letter(explains: dict[str, str]) -> str:
    nonempty = [L for L in "ABCD" if explains[L].strip()]
    if len(nonempty) == 1:
        return nonempty[0]

    def rank(L: str) -> tuple:
        t = explains[L]
        neg_hits = len(NEG.findall(t))
        return (-len(t), neg_hits, L)

    return min("ABCD", key=lambda L: rank(L))


def main() -> None:
    repo = Path(sys.argv[1] if len(sys.argv) > 1 else "").resolve()
    if not repo.is_dir():
        raise SystemExit("Usage: python build_saa_c03_answer_key_from_github.py <path-to-cloned-repo>")

    parsed = parse_extract(EXTRACT_PATH)
    multi_ids = {q["id"] for q in parsed if q["multi"]}

    key: dict[str, str] = {}
    missing_md: list[int] = []

    for qid in range(1, 685):
        if qid in multi_ids:
            continue
        q = next((x for x in parsed if x["id"] == qid), None)
        if not q or not eligible(q):
            continue
        md_path = find_md(repo, qid)
        if not md_path:
            missing_md.append(qid)
            continue
        md = md_path.read_text(encoding="utf-8", errors="replace")
        if MULTI_HINT.search(md):
            continue
        letter = explicit_letter(md)
        if letter is None:
            explains = option_explains(md)
            letter = pick_letter(explains)
        letter = OVERRIDES.get(qid, letter)
        key[str(qid)] = letter

    ANSWER_KEY_OUT.write_text(json.dumps(key, indent=2), encoding="utf-8")
    print(f"Wrote {ANSWER_KEY_OUT} with {len(key)} entries")
    if missing_md:
        print(f"Missing markdown files for {len(missing_md)} ids (first 20): {missing_md[:20]}")


if __name__ == "__main__":
    main()
