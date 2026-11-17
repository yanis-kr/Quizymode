"""Review ledger, evidence packets and verdict ingest for seed content (#726).

Standard library only. The source cache is read here; fetching is a follow-up issue (not in this module).
"""
from __future__ import annotations

import hashlib
import json
import random
import re
from pathlib import Path
from typing import Any, Iterable

from seed_source_common import REGISTRY_ROOT, ROOT, SourceItem

QUALITY_ROOT = REGISTRY_ROOT / "quality"
CACHE_ROOT = ROOT / ".cache" / "content-quality"
RUBRIC_VERSION = "1"
PASSAGE_MAX_WORDS = 600  # about 800 tokens at 1.33 tokens per word
PASSAGE_WINDOW_WORDS = 120
LEVELS = ("L1", "L2", "L3", "owner", "legacy")
STATUSES = ("unreviewed", "lint-clean", "blind-agree", "source-verified", "owner-verified", "flagged", "legacy-unverified")


def _norm(text: str) -> str:
    return " ".join(text.split())


def content_hash(item: SourceItem) -> str:
    """SHA-256 over the canonical question, answers, explanation and source. Keywords and images are excluded."""
    canonical = {
        "question": _norm(item.question),
        "correct": _norm(item.correct_answer),
        "incorrect": sorted(_norm(o) for o in item.incorrect_answers),
        "explanation": _norm(item.explanation or ""),
        "source": _norm(item.source or ""),
    }
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def ledger_path(category: str, quality_root: Path = QUALITY_ROOT) -> Path:
    return quality_root / f"{category}.jsonl"


def read_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def append_rows(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    rows = list(rows)
    if not rows:
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, sort_keys=True, ensure_ascii=False) + "\n")
    return len(rows)


def latest_by_key(rows: Iterable[dict[str, Any]]) -> dict[tuple[str, str, str], dict[str, Any]]:
    latest: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in rows:
        latest[(row["itemId"], row["level"], row["rubricVersion"])] = row
    return latest


def queue(items: list[SourceItem], rows: list[dict[str, Any]], level: str, budget: int) -> list[SourceItem]:
    """Items with no ledger row at their current hash, level and rubric version. Rows at a stale hash re-queue."""
    current = latest_by_key(rows)
    pending = []
    for item in items:
        row = current.get((item.item_id, level, RUBRIC_VERSION))
        if row is None or row["contentHash"] != content_hash(item):
            pending.append(item)
        if len(pending) >= budget:
            break
    return pending


def shuffled_options(item: SourceItem, seed: str) -> list[str]:
    options = [item.correct_answer, *item.incorrect_answers]
    rng = random.Random(f"{seed}:{item.item_id}")
    rng.shuffle(options)
    return options


def cache_path(url: str, cache_root: Path = CACHE_ROOT) -> Path:
    return cache_root / f"{hashlib.sha256(url.encode('utf-8')).hexdigest()}.json"


def read_cache(url: str, cache_root: Path = CACHE_ROOT) -> dict[str, Any] | None:
    path = cache_path(url, cache_root)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def best_passage(text: str, item: SourceItem) -> str:
    """The window of words with the most overlap with the question and key, at most PASSAGE_MAX_WORDS."""
    words = text.split()
    if len(words) <= PASSAGE_MAX_WORDS:
        return " ".join(words)
    wanted = {w.lower().strip(".,;:()") for w in f"{item.question} {item.correct_answer}".split() if len(w) > 3}
    best_start, best_score = 0, -1
    step = max(1, PASSAGE_WINDOW_WORDS // 2)
    for start in range(0, len(words) - PASSAGE_WINDOW_WORDS + 1, step):
        window = words[start:start + PASSAGE_WINDOW_WORDS]
        score = sum(1 for w in window if w.lower().strip(".,;:()") in wanted)
        if score > best_score:
            best_start, best_score = start, score
    return " ".join(words[best_start:best_start + PASSAGE_MAX_WORDS])


def packet(item: SourceItem, level: str, seed: str, cache_root: Path = CACHE_ROOT) -> dict[str, Any]:
    """Level packets never carry the key marker or the explanation. L2 adds a passage from the cache only."""
    body: dict[str, Any] = {
        "itemId": item.item_id,
        "level": level,
        "question": item.question,
        "options": shuffled_options(item, seed),
        "shuffleSeed": seed,
    }
    if level == "L2" and item.source:
        cached = read_cache(item.source, cache_root)
        if cached:
            body["passage"] = best_passage(cached.get("text", ""), item)
            body["sourceUrl"] = item.source
    return body


def verify_quote(quote: str, source_text: str) -> bool:
    return bool(quote.strip()) and _norm(quote) in _norm(source_text)


def ingest(verdicts: Iterable[dict[str, Any]], items: dict[str, SourceItem], cache_root: Path = CACHE_ROOT) -> tuple[list[dict[str, Any]], list[str]]:
    """Validate returned verdicts and return (accepted rows, rejection messages)."""
    accepted: list[dict[str, Any]] = []
    rejected: list[str] = []
    for verdict in verdicts:
        item_id = verdict.get("itemId")
        item = items.get(item_id or "")
        if item is None:
            rejected.append(f"{item_id}: unknown item")
            continue
        if verdict.get("level") not in LEVELS or verdict.get("status") not in STATUSES:
            rejected.append(f"{item_id}: bad level or status")
            continue
        quote = verdict.get("quote")
        if quote:
            cached = read_cache(verdict.get("sourceUrl", ""), cache_root)
            if not cached or not verify_quote(quote, cached.get("text", "")):
                rejected.append(f"{item_id}: quote not found in cached source text")
                continue
        accepted.append({
            "itemId": item.item_id,
            "contentHash": content_hash(item),
            "rubricVersion": RUBRIC_VERSION,
            "level": verdict["level"],
            "status": verdict["status"],
            "flags": verdict.get("flags", []),
            "sourceUrl": verdict.get("sourceUrl"),
            "sourceTextHash": hashlib.sha256((cached or {}).get("text", "").encode("utf-8")).hexdigest() if quote else None,
            "quote": quote,
            "checkedAt": verdict.get("checkedAt"),
            "checker": verdict.get("checker", "unknown"),
        })
    return accepted, rejected


def load_fact_checks(source_root: Path) -> dict[str, list[dict[str, Any]]]:
    """itemId -> factChecks, read from the raw item files (SourceItem does not carry them)."""
    found: dict[str, list[dict[str, Any]]] = {}
    for path in sorted(source_root.rglob("*.json")):
        for raw in json.loads(path.read_text(encoding="utf-8")):
            if raw.get("factChecks"):
                found[str(raw.get("itemId", "")).strip()] = raw["factChecks"]
    return found


def legacy_rows(items: Iterable[SourceItem], fact_checks: dict[str, list[dict[str, Any]]], existing: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Import factChecks as legacy-unverified rows. Item files are not edited. Re-running adds nothing new."""
    seen = {(r["itemId"], r.get("checker"), r.get("checkedAt")) for r in existing if r.get("level") == "legacy"}
    rows: list[dict[str, Any]] = []
    for item in items:
        for check in fact_checks.get(item.item_id, []):
            key = (item.item_id, check.get("factChecker"), check.get("checked"))
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                "itemId": item.item_id,
                "contentHash": content_hash(item),
                "rubricVersion": RUBRIC_VERSION,
                "level": "legacy",
                "status": "legacy-unverified",
                "flags": [],
                "sourceUrl": check.get("source"),
                "sourceTextHash": None,
                "quote": None,
                "checkedAt": check.get("checked"),
                "checker": check.get("factChecker", "unknown"),
            })
    return rows


def compact(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(latest_by_key(rows).values(), key=lambda r: (r["itemId"], r["level"], r["rubricVersion"]))


def pr_table(rows: list[dict[str, Any]], ids: set[str]) -> str:
    lines = ["| itemId | level | status | checker | checkedAt |", "| --- | --- | --- | --- | --- |"]
    for row in compact(rows):
        if row["itemId"] in ids:
            lines.append(f"| {row['itemId']} | {row['level']} | {row['status']} | {row['checker']} | {row.get('checkedAt') or ''} |")
    return "\n".join(lines)

