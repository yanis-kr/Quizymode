#!/usr/bin/env python3
"""
Parse AWS_SAA_C03_extracted.txt into exams.aws.saa-c03-p*.json bulk seed files.

- Skips (Choose two) / (Choose three) items (not compatible with single-answer schema).
- Enforces Quizymode limits: question <= 1000 chars, each answer <= 500 chars.
- Reads answers from data/extras/exams/saa_c03_extract_answer_key.json
  { "1": "A", "2": "C", ... } (letters only, case-insensitive).

Usage:
  python scripts/convert_saa_c03_extract.py [--max-chunks N]
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from saa_c03_keywords import SAA_C03_SEED_SOURCE, infer_saa_c03_keywords
from seed_progress_paths import category_progress_file, ensure_category_progress_dir

ROOT = Path(__file__).resolve().parents[1]
EXTRACT_PATH = ROOT / "data" / "seed-source" / "items" / "exams" / "AWS_SAA_C03_extracted.txt"
AUXILIARY_EXAMS_DIR = ROOT / "data" / "extras" / "exams"
ANSWER_KEY_PATH = AUXILIARY_EXAMS_DIR / "saa_c03_extract_answer_key.json"
OUT_DIR = ROOT / "data" / "seed-source" / "items" / "exams"

QUESTION_START = re.compile(r"^Question #(\d+)\s+Topic\s+\d+\s*$")
OPTION_START = re.compile(r"^([A-E])\.\s+(.*)$")
MULTI_RE = re.compile(
    r"\(\s*Choose\s+two\s*\.?\s*\)|\(\s*Choose\s+three\s*\.?\s*\)",
    re.IGNORECASE,
)

def clean_text(s: str) -> str:
    """Normalize PDF extraction noise (replacement chars, broken ligatures)."""
    s = s.replace("\ufeff", "").replace("\u0000", "")
    s = s.replace("\ufffd", "")
    s = re.sub(r"Con.?gure", "Configure", s)
    s = re.sub(r"Noti.?cation", "Notification", s)
    s = re.sub(r"tra.?c", "traffic", s)
    s = re.sub(r"fi.?ltering", "filtering", s)
    s = re.sub(r"speci.?c", "specific", s)
    s = re.sub(r"fi.?rewall", "firewall", s)
    s = re.sub(r"fi.?nancial", "financial", s)
    s = re.sub(r"pro.?le", "profile", s)
    s = re.sub(r"Modi.?cations", "Modifications", s)
    s = re.sub(r"fi.?rst", "first", s)
    s = re.sub(r"VPC.?on.?gure", "VPC. Configure", s, flags=re.I)
    s = re.sub(r"e.?cient", "efficient", s)
    s = re.sub(r"work.?ow", "workflow", s)
    s = re.sub(r"con.?dence", "confidence", s)
    s = re.sub(r"fi.?ow", "flow", s)
    s = s.replace("log les", "log files").replace("video les", "video files")
    s = s.replace("the credential le", "the credential file").replace("le share", "file share")
    s = s.replace("meats that contain", "objects that contain")
    s = s.replace("Amazon SOS)", "Amazon SQS)")
    s = s.replace("aws PrincipalOrgID", "aws:PrincipalOrgID")
    s = s.replace("Amazon ample", "Amazon Simple")
    lines = [" ".join(line.split()) for line in s.splitlines()]
    s = "\n".join(lines)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def truncate(s: str, max_len: int) -> str:
    s = clean_text(s)
    if len(s) <= max_len:
        return s
    return s[: max_len - 1].rstrip() + "&"


def parse_extract(path: Path) -> list[dict]:
    raw = path.read_text(encoding="utf-8", errors="replace")
    lines = raw.splitlines()
    questions: list[dict] = []
    i = 0
    while i < len(lines):
        m = QUESTION_START.match(lines[i].strip())
        if not m:
            i += 1
            continue
        qid = int(m.group(1))
        i += 1
        stem_lines: list[str] = []
        while i < len(lines):
            om = OPTION_START.match(lines[i].strip())
            if om:
                break
            if QUESTION_START.match(lines[i].strip()):
                break
            stem_lines.append(lines[i])
            i += 1
        stem = clean_text("\n".join(stem_lines))
        options: dict[str, str] = {}
        while i < len(lines):
            om = OPTION_START.match(lines[i].strip())
            if QUESTION_START.match(lines[i].strip()):
                break
            if om:
                letter = om.group(1)
                parts = [om.group(2)]
                i += 1
                while i < len(lines):
                    if OPTION_START.match(lines[i].strip()) or QUESTION_START.match(lines[i].strip()):
                        break
                    parts.append(lines[i])
                    i += 1
                options[letter] = clean_text(" ".join(parts))
                continue
            i += 1
        multi = bool(MULTI_RE.search(stem))
        questions.append(
            {
                "id": qid,
                "stem": stem,
                "options": options,
                "multi": multi,
            }
        )
    questions.sort(key=lambda q: q["id"])
    return questions


def eligible(q: dict) -> bool:
    if q["multi"]:
        return False
    # expect four options A-D for standard items
    return {"A", "B", "C", "D"} <= set(q["options"].keys())


def build_chunks(parsed: list[dict]) -> list[list[dict]]:
    chunks: list[list[dict]] = []
    cur: list[dict] = []
    for q in parsed:
        if not eligible(q):
            continue
        cur.append(q)
        if len(cur) == 20:
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    return chunks


def to_seed_item(q: dict, letter: str) -> dict | None:
    letter = letter.strip().upper()
    opts = q["options"]
    if letter not in opts:
        return None
    correct = truncate(opts[letter], 500)
    incorrect_letters = [L for L in "ABCD" if L != letter]
    incorrect = [truncate(opts[L], 500) for L in incorrect_letters]
    stem = truncate(q["stem"], 1000)
    return {
        "category": "exams",
        "navigationKeyword1": "aws",
        "navigationKeyword2": "saa-c03",
        "question": stem,
        "correctAnswer": correct,
        "incorrectAnswers": incorrect,
        "explanation": f"SAA-C03 practice scenario (extract question #{q['id']}). Correct choice: {letter}.",
        "keywords": infer_saa_c03_keywords(stem, correct, incorrect),
        "source": SAA_C03_SEED_SOURCE,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-chunks", type=int, default=0, help="0 = all chunks")
    args = ap.parse_args()

    parsed = parse_extract(EXTRACT_PATH)
    multi_count = sum(1 for q in parsed if q["multi"])
    ineligible = sum(1 for q in parsed if not eligible(q) and not q["multi"])

    if not ANSWER_KEY_PATH.exists():
        raise SystemExit(f"Missing answer key: {ANSWER_KEY_PATH}")

    answer_key: dict[str, str] = json.loads(ANSWER_KEY_PATH.read_text(encoding="utf-8"))

    chunks = build_chunks(parsed)
    max_c = len(chunks) if args.max_chunks <= 0 else min(args.max_chunks, len(chunks))

    corrupt = [q["id"] for q in parsed if not q["multi"] and not eligible(q)]
    report_lines = [
        f"Parsed questions (all): {len(parsed)}",
        f"Multi-select (skipped): {multi_count}",
        f"Other ineligible (non-ABCD): {ineligible}"
        + (f" (question ids: {corrupt})" if corrupt else ""),
        f"Eligible single-choice: {sum(len(c) for c in chunks)}",
        f"Chunks (20 each, last may be shorter): {len(chunks)}",
        "Note: answers are derived from GitHub explanations and a short override list; spot-check before treating as authoritative.",
        "",
    ]

    for idx in range(max_c):
        chunk = chunks[idx]
        part = idx + 2  # p02, p03, ... (two-digit suffix, matches p01 base)
        out_path = OUT_DIR / f"exams.aws.saa-c03-p{part:02d}.json"
        items: list[dict] = []
        missing: list[int] = []
        for q in chunk:
            key = str(q["id"])
            letter = answer_key.get(key)
            if not letter:
                missing.append(q["id"])
                continue
            item = to_seed_item(q, letter)
            if item:
                items.append(item)
        out_path.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        report_lines.append(
            f"Wrote {out_path.name}: {len(items)} items (missing answers for: {missing or 'none'})"
        )

    ensure_category_progress_dir("exams")
    progress_path = category_progress_file("exams", "_saa_progress.md")
    total_written = sum(
        len(json.loads((OUT_DIR / f"exams.aws.saa-c03-p{idx + 2:02d}.json").read_text(encoding="utf-8")))
        for idx in range(max_c)
    )
    header = (
        "# SAA-C03 extract import progress\n\n"
        f"- Source: `data/seed-source/items/exams/AWS_SAA_C03_extracted.txt`\n"
        f"- Answer key: `data/extras/exams/saa_c03_extract_answer_key.json` "
        f"(from `scripts/build_saa_c03_answer_key_from_github.py`; "
        f"uses explanations in [77629296/aws-certified-solutions-architect-associate-saa-c03](https://github.com/77629296/aws-certified-solutions-architect-associate-saa-c03) plus small `OVERRIDES`)\n"
        f"- Base seed (short items): `exams.aws.saa-c03.json` (15 items)\n"
        f"- Part files: `exams.aws.saa-c03-p02.json` … `p{1 + max_c:02d}.json` — **{total_written}** scenario items this run\n"
        f"- Keywords (all parts): same as base — `aws-saa-c03`, `aws-architecture`, `aws-services`\n"
        f"- Last run (UTC): {datetime.now(timezone.utc).isoformat()}\n\n"
    )
    stamp = "\n".join(report_lines)
    progress_path.write_text(header + "## Latest conversion\n\n" + stamp + "\n", encoding="utf-8")
    print(stamp)


if __name__ == "__main__":
    main()
