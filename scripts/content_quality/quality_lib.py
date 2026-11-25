"""Review ledger, evidence packets and verdict ingest for seed content (#726).

Standard library only. The source cache is read here; fetching is a follow-up issue (not in this module).
"""
from __future__ import annotations

import hashlib
import json
import random
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

from seed_source_common import REGISTRY_ROOT, ROOT, SourceItem

QUALITY_ROOT = REGISTRY_ROOT / "quality"
CACHE_ROOT = ROOT / ".cache" / "content-quality"
RUBRIC_VERSION = "1"
PASSAGE_MAX_WORDS = 600  # about 800 tokens at 1.33 tokens per word
PASSAGE_WINDOW_WORDS = 120
LEVELS = ("L1", "L2", "L3", "owner", "legacy")
STATUSES = ("unreviewed", "unverified", "lint-clean", "blind-agree", "source-verified", "owner-verified", "flagged", "legacy-unverified")


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
    if budget < 0:
        raise ValueError("budget must be zero or greater")
    if budget == 0:
        return []
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


def packet(
    item: SourceItem,
    level: str,
    seed: str,
    cache_root: Path = CACHE_ROOT,
    source_url: str | None = None,
    findings: dict[str, Any] | None = None,
    second_source_url: str | None = None,
) -> dict[str, Any]:
    """Build a level-specific review packet without labels or reviewer reasoning."""
    if level not in {"L1", "L2", "L3"}:
        raise ValueError(f"unsupported packet level: {level}")
    body: dict[str, Any] = {
        "itemId": item.item_id,
        "level": level,
        "question": item.question,
        "options": shuffled_options(item, seed),
        "shuffleSeed": seed,
    }
    if level in {"L2", "L3"}:
        body["correctAnswer"] = item.correct_answer
        body["explanation"] = item.explanation or ""
        review_source = source_url or item.source
        cached = read_cache(review_source, cache_root) if review_source else None
        if cached:
            body["passage"] = best_passage(cached.get("text", ""), item)
            body["sourceUrl"] = review_source
        if level == "L3":
            body["findings"] = {
                key: findings.get(key)
                for key in ("l1Answer", "l1MultipleDefensible", "l2Verdict", "l2ProposedChange")
            } if findings else {}
            second_cached = read_cache(second_source_url, cache_root) if second_source_url else None
            if second_cached:
                body["secondPassage"] = best_passage(second_cached.get("text", ""), item)
                body["secondSourceUrl"] = second_source_url
    return body


def item_source_candidates(item: SourceItem) -> list[str]:
    """Return the item source, legacy fact-check sources, and URLs embedded in its explanation."""
    candidates: list[str] = []
    if item.source:
        candidates.append(item.source)
    try:
        raw_items = json.loads(item.path.read_text(encoding="utf-8"))
        raw = raw_items[item.index]
    except (OSError, IndexError, json.JSONDecodeError, TypeError):
        raw = {}
    for check in raw.get("factChecks", []) if isinstance(raw, dict) else []:
        if isinstance(check, dict) and isinstance(check.get("source"), str):
            candidates.append(check["source"])
    candidates.extend(re.findall(r"https?://[^\s)\]>]+", item.explanation or ""))
    return list(dict.fromkeys(url.rstrip(".,;") for url in candidates if url.startswith(("http://", "https://"))))


def eligible_source_url(item: SourceItem, tiers: dict[str, Any], minimum_tier: str) -> str | None:
    """Select the first cited source meeting a profile's minimum provenance tier."""
    from fetcher import tier_for_url

    tier_order = {f"T{n}": n for n in range(1, 6)}
    maximum = tier_order.get(minimum_tier, 5)
    for url in item_source_candidates(item):
        if tier_order.get(tier_for_url(url, tiers), 99) <= maximum:
            return url
    return None


def verify_quote(quote: str, source_text: str) -> bool:
    return bool(quote.strip()) and _norm(quote) in _norm(source_text)


def cache_is_ok(cached: dict[str, Any] | None) -> bool:
    if cached is None:
        return False
    status = cached.get("status", "ok")
    return status == "ok" or isinstance(status, int) and 200 <= status < 300


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
        source_url = verdict.get("sourceUrl")
        cached = read_cache(source_url or "", cache_root) if source_url else None
        if quote and (not cache_is_ok(cached) or not verify_quote(quote, cached.get("text", ""))):
            rejected.append(f"{item_id}: quote not found in cached source text")
            continue
        if quote and item.category == "exams":
            from fetcher import load_profiles, load_tiers, tier_for_url

            profiles = load_profiles()
            profile = profiles.get(item.category, profiles["default"])
            minimum = profile.get("minTier", "T5")
            tiers = load_tiers()
            actual = tier_for_url(source_url or "", tiers)
            tier_order = {f"T{n}": n for n in range(1, 6)}
            if tier_order.get(actual, 99) > tier_order.get(minimum, 5):
                rejected.append(f"{item_id}: source tier {actual} is below required {minimum}")
                continue
        if verdict["status"] == "source-verified":
            if verdict["level"] not in {"L2", "L3"} or not quote:
                rejected.append(f"{item_id}: source-verified requires an L2/L3 quote")
                continue
        accepted.append({
            "itemId": item.item_id,
            "contentHash": content_hash(item),
            "rubricVersion": RUBRIC_VERSION,
            "level": verdict["level"],
            "status": verdict["status"],
            "flags": verdict.get("flags", []),
            "sourceUrl": source_url,
            "sourceTextHash": hashlib.sha256(cached.get("text", "").encode("utf-8")).hexdigest() if cache_is_ok(cached) else None,
            "quote": quote,
            "checkedAt": verdict.get("checkedAt"),
            "checker": verdict.get("checker", "unknown"),
            "modelId": verdict.get("modelId"),
            "callId": verdict.get("callId"),
            "verdict": verdict.get("verdict"),
            "answer": verdict.get("answer"),
            "multipleDefensibleAnswers": verdict.get("multipleDefensibleAnswers"),
            "difficulty": verdict.get("difficulty"),
            "proposedFix": verdict.get("proposedFix"),
            "adjudication": verdict.get("adjudication"),
            "inputTokens": verdict.get("inputTokens"),
            "outputTokens": verdict.get("outputTokens"),
            "usageAvailable": verdict.get("inputTokens") is not None or verdict.get("outputTokens") is not None,
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


def validate_proposal(item_id: str, change_class: str, rows: list[dict[str, Any]]) -> None:
    """Require quote-backed L2 evidence and independent L3 support for exam class B changes."""
    if change_class not in {"A", "B", "C"}:
        raise ValueError("change class must be A, B or C")
    by_level = {row.get("level"): row for row in rows if row.get("itemId") == item_id}
    l2 = by_level.get("L2")
    l3 = by_level.get("L3")
    if not l2 or not l2.get("quote") or not l2.get("sourceTextHash"):
        raise ValueError(f"{item_id}: class {change_class} requires quote-backed L2 evidence")
    if change_class == "B" and (not l3 or l3.get("adjudication") != "supports-change" or not l3.get("quote") or not l3.get("sourceTextHash")):
        raise ValueError(f"{item_id}: class B requires quote-backed L3 support")


def pr_table(rows: list[dict[str, Any]], ids: set[str]) -> str:
    lines = ["| itemId | level | status | checker | checkedAt |", "| --- | --- | --- | --- | --- |"]
    for row in compact(rows):
        if row["itemId"] in ids:
            lines.append(f"| {row['itemId']} | {row['level']} | {row['status']} | {row['checker']} | {row.get('checkedAt') or ''} |")
    return "\n".join(lines)


def proposal_evidence_table(rows: list[dict[str, Any]], changes: list[dict[str, Any]]) -> str:
    """Render a reviewable before/after evidence table after enforcing class gates."""
    lines = [
        "| itemId | class | before | after | levels | quote | source | finding |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    latest = latest_by_key(rows)
    for change in changes:
        item_id = str(change["itemId"])
        change_class = str(change["changeClass"])
        validate_proposal(item_id, change_class, rows)
        evidence = [row for row in latest.values() if row.get("itemId") == item_id and row.get("level") in {"L1", "L2", "L3"}]
        by_level = {row.get("level"): row for row in evidence}
        l2 = by_level.get("L2", {})
        levels = ", ".join(f"{level}: {by_level[level].get('status', '')}" for level in ("L1", "L2", "L3") if level in by_level)
        quote = l3.get("quote") if change_class == "B" and (l3 := by_level.get("L3")) else l2.get("quote")
        source = l3.get("sourceUrl") if change_class == "B" else l2.get("sourceUrl")
        finding = l2.get("proposedFix") or l2.get("verdict") or ""
        values = [item_id, change_class, change.get("before", ""), change.get("after", ""), levels, quote or "", source or "", finding]
        lines.append("| " + " | ".join(str(value).replace("|", "\\|").replace("\n", " ") for value in values) + " |")
    return "\n".join(lines)



TIER_RISK = {"T1": 1, "T2": 2, "T3": 3, "T4": 4, "T5": 5}


def _parse_checked(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def risk_queue(
    items: list[SourceItem],
    rows: list[dict[str, Any]],
    level: str,
    budget: int,
    tiers: dict[str, Any],
    profiles: dict[str, Any],
    now: datetime,
    cache_root: Path = CACHE_ROOT,
) -> list[tuple[SourceItem, str, int]]:
    """Items needing review, highest risk first, with the reason and risk score (#724 D3, #769).

    Risk = provenance tier of the cited source (an unfetchable or missing source counts as the unfetchable tier) x
    profile stakes. A row is current when its hash, level and rubric version match, its profile's review interval has
    not passed, and the cited source text has not changed since the row was written. Ties break on item id.
    """
    from fetcher import tier_for_url  # local import: fetcher imports this module

    if budget < 0:
        raise ValueError("budget must be zero or greater")
    if budget == 0:
        return []

    current = latest_by_key(rows)
    scored: list[tuple[int, str, SourceItem, str]] = []
    for item in items:
        profile = profiles.get(item.category, profiles["default"])
        row = current.get((item.item_id, level, RUBRIC_VERSION))
        reason: str | None = None
        if row is None:
            reason = "no ledger row"
        elif row["contentHash"] != content_hash(item):
            reason = "content changed"
        elif (checked := _parse_checked(row.get("checkedAt"))) is not None and (
            now - checked > timedelta(days=profile["reviewIntervalDays"])
        ):
            reason = "review interval passed"
        elif row.get("sourceUrl") and row.get("sourceTextHash"):
            cached = read_cache(row["sourceUrl"], cache_root)
            if cached is None or hashlib.sha256(cached.get("text", "").encode("utf-8")).hexdigest() != row["sourceTextHash"]:
                reason = "source text changed"
        if reason is None:
            continue
        # Not fetched yet: the domain tier. Fetched but unfetchable: the unfetchable tier.
        cached = read_cache(item.source, cache_root) if item.source else None
        if item.source and (cached is None or cached.get("status", "ok") == "ok"):
            tier = tier_for_url(item.source, tiers)
        else:
            tier = tiers["unfetchableTier"]
        score = TIER_RISK[tier] * profile["stakes"]
        scored.append((-score, item.item_id, item, f"{reason}; source tier {tier}; profile {item.category if item.category in profiles else 'default'}"))
    scored.sort(key=lambda entry: (entry[0], entry[1]))
    return [(item, reason, -neg) for neg, _id, item, reason in scored[:budget]]
