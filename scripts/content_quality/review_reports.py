"""Deterministic calibration and pilot report calculations for #727."""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


POSITIVE_VERDICTS = {"key-mismatch", "wrong-key", "needs-fix", "content-error", "propose-fix", "content-fix", "ambiguous", "blind-answer-mismatch", "multiple-defensible-answers"}


# Owner decision 2026-11-25 on #727: the go/no-go recall bar is 85% (was 90% in the issue). The false-flag bar stays under 20%.
RECALL_BAR = 0.85

def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


# Owner decision 2026-11-25 on #727: a known-good item is a false flag only when L2 says the answer is wrong or ambiguous.
# A `content-fix` verdict (wording or explanation edit) on a known-good item is reported separately as `contentFixFlags`.
KEY_PROBLEM_VERDICTS = {"key-mismatch", "ambiguous"}


def _key_problem(row: dict[str, Any] | None) -> bool:
    if row is None:
        return False
    verdict = str(row.get("verdict", "")).strip().lower().replace("_", "-")
    flags = {str(flag).strip().lower().replace("_", "-") for flag in row.get("flags", [])}
    return verdict in KEY_PROBLEM_VERDICTS or bool(flags & KEY_PROBLEM_VERDICTS)


def _positive(row: dict[str, Any] | None) -> bool:
    if row is None:
        return False
    verdict = str(row.get("verdict", "")).strip().lower().replace("_", "-")
    flags = {str(flag).strip().lower().replace("_", "-") for flag in row.get("flags", [])}
    return verdict in POSITIVE_VERDICTS or bool(flags & POSITIVE_VERDICTS)


def _rows_for_labels(rows: Iterable[dict[str, Any]], labels: dict[str, dict[str, Any]], level: str) -> dict[str, dict[str, Any]]:
    """Latest row per labelled item at a level. A label with a contentHash only accepts rows reviewed at that hash,
    so a baseline review of an unseeded original never counts for the seeded item."""
    selected: dict[str, dict[str, Any]] = {}
    for row in rows:
        item_id = str(row.get("itemId"))
        label = labels.get(item_id)
        if row.get("level") != level or label is None:
            continue
        if label.get("contentHash") and row.get("contentHash") and row["contentHash"] != label["contentHash"]:
            continue
        selected[item_id] = row
    return selected


def _rate(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def _level_stats(rows: list[dict[str, Any]], labels: dict[str, dict[str, Any]], level: str) -> dict[str, Any]:
    by_id = _rows_for_labels(rows, labels, level)
    counts = Counter(str(label.get("label")) for label in labels.values())
    positive = {item_id for item_id, row in by_id.items() if _positive(row)}
    historical = {item_id for item_id, label in labels.items() if label.get("label") == "historical-wrong-key"}
    seeded = {item_id for item_id, label in labels.items() if label.get("label") == "seeded-wrong-key"}
    known_good = {item_id for item_id, label in labels.items() if label.get("label") == "known-good"}
    cited = {item_id for item_id, row in by_id.items() if row.get("quote") and row.get("sourceTextHash")}
    calls_by_id = {row.get("callId", f"item:{item_id}"): row for item_id, row in by_id.items()}
    usage_rows = [row for row in calls_by_id.values() if isinstance(row.get("inputTokens"), int) or isinstance(row.get("outputTokens"), int)]
    input_tokens = sum(row.get("inputTokens") or 0 for row in usage_rows)
    output_tokens = sum(row.get("outputTokens") or 0 for row in usage_rows)
    calls = {row.get("callId") for row in by_id.values() if row.get("callId")}
    return {
        "items": len(by_id),
        "calls": len(calls) if calls else None,
        "flags": len(positive),
        "notRun": sum(1 for item_id in labels if item_id not in by_id),
        "sourceGaps": sum(1 for item_id in by_id if labels[item_id].get("requiresQuote") and item_id not in cited) if level != "L1" else None,
        "quoteBackedFindings": len(positive & cited),
        "historicalWrongKeys": {"caught": len(positive & historical), "total": counts["historical-wrong-key"], "rate": _rate(len(positive & historical), len(historical))},
        "seededErrors": {"caught": len(positive & seeded), "total": counts["seeded-wrong-key"], "rate": _rate(len(positive & seeded), len(seeded))},
        "knownGoodFalseFlags": {"count": len(positive & known_good), "total": len(known_good), "rate": _rate(len(positive & known_good), len(known_good))},
        "usage": {
            "available": bool(usage_rows),
            "inputTokens": input_tokens if usage_rows else None,
            "outputTokens": output_tokens if usage_rows else None,
            "unavailableCalls": len(calls_by_id) - len(usage_rows),
        },
    }


def calibration_report(
    labels_rows: Iterable[dict[str, Any]],
    l1_rows: list[dict[str, Any]],
    l2_rows: list[dict[str, Any]],
    rubric_version: str,
    model_ids: dict[str, str],
) -> dict[str, Any]:
    """Score observed reviewer outputs without putting labels into reviewer packets."""
    labels = {str(row["itemId"]): row for row in labels_rows}
    l1 = _level_stats(l1_rows, labels, "L1")
    l2 = _level_stats(l2_rows, labels, "L2")
    l2_by_id = _rows_for_labels(l2_rows, labels, "L2")
    hist = {item_id for item_id, row in labels.items() if row.get("label") == "historical-wrong-key"}
    seeded = {item_id for item_id, row in labels.items() if row.get("label") == "seeded-wrong-key"}
    good = {item_id for item_id, row in labels.items() if row.get("label") == "known-good"}
    supported = {
        item_id for item_id, row in l2_by_id.items()
        if _positive(row) and row.get("quote") and row.get("sourceTextHash")
    }
    combined_hist = len(hist & supported)
    strict_false_good = len(good & supported)
    false_good = len({i for i in good & supported if _key_problem(l2_by_id.get(i))})
    combined_seeded = len(seeded & supported)
    recall = _rate(combined_hist, len(hist))
    false_rate = _rate(false_good, len(good))
    not_run = sum(1 for item_id in labels if item_id not in l2_by_id)
    unavailable = sum(
        1 for item_id, label in labels.items()
        if label.get("requiresQuote") and item_id in l2_by_id and (
            l2_by_id[item_id].get("status") == "unverified"
            or l2_by_id[item_id].get("verdict") == "evidence-gap"
            or not l2_by_id[item_id].get("quote")
            or not l2_by_id[item_id].get("sourceTextHash")
        )
    )
    return {
        "rubricVersion": rubric_version,
        "models": model_ids,
        "labels": dict(Counter(str(row.get("label")) for row in labels.values())),
        "levels": {"L1": l1, "L2": l2},
        "combined": {
            "historicalWrongKeys": {"caught": combined_hist, "total": len(hist), "rate": recall},
            "knownGoodFalseFlags": {"count": false_good, "total": len(good), "rate": false_rate, "contentFixFlags": strict_false_good - false_good, "strictCount": strict_false_good, "strictRate": _rate(strict_false_good, len(good))},
            "seededErrorCatchRate": {"caught": combined_seeded, "total": len(seeded), "rate": _rate(combined_seeded, len(seeded))},
            "sourceGaps": unavailable,
            "notRun": not_run,
            "complete": not_run == 0,
            "go": not_run == 0 and recall is not None and false_rate is not None and recall >= RECALL_BAR and false_rate < 0.2,
        },
    }


def pilot_report(rows: list[dict[str, Any]], set_name: str) -> dict[str, Any]:
    """Aggregate completed ledger rows for one set, keeping missing usage explicit."""
    levels: dict[str, Any] = {}
    for level in ("L1", "L2", "L3"):
        subset = [row for row in rows if row.get("level") == level]
        calls = {row.get("callId", f"item:{row.get('itemId')}"): row for row in subset}
        measured = [row for row in calls.values() if isinstance(row.get("inputTokens"), int) or isinstance(row.get("outputTokens"), int)]
        inputs = sum(row.get("inputTokens") or 0 for row in measured)
        outputs = sum(row.get("outputTokens") or 0 for row in measured)
        levels[level] = {
            "items": len({row.get("itemId") for row in subset}),
            "calls": len({row.get("callId") for row in subset if row.get("callId")}) or None,
            "flags": sum(1 for row in subset if _positive(row)),
            "sourceGaps": sum(1 for row in subset if row.get("status") == "unverified"),
            "usage": {
                "available": bool(measured),
                "inputTokens": inputs if measured else None,
                "outputTokens": outputs if measured else None,
                "inputTokensPerItem": inputs / len(measured) if measured else None,
                "outputTokensPerItem": outputs / len(measured) if measured else None,
                "unavailableCalls": len(calls) - len(measured),
            },
        }
    statuses = Counter(str(row.get("status", "unknown")) for row in rows)
    return {"set": set_name, "items": len({row.get("itemId") for row in rows}), "statuses": dict(statuses), "levels": levels}


PILOT_MAX_CHANGED_ITEMS = 25
PILOT_ALLOWED_PREFIXES = ("data/seed-source/items/", "data/seed-source/_registry/")


def pilot_gate(report: dict[str, Any], rubric_version: str) -> list[str]:
    """Return the reasons the pilot may not start. An empty list means calibration passed for this rubric version."""
    reasons: list[str] = []
    combined = report.get("combined") or {}
    if str(report.get("rubricVersion")) != str(rubric_version):
        reasons.append(f"report rubric version {report.get('rubricVersion')} is not the current {rubric_version}")
    if not report.get("models"):
        reasons.append("report does not record the model IDs")
    if not combined.get("complete"):
        reasons.append(f"calibration is incomplete: {combined.get('notRun')} fixture items have no L2 result at their hash")
    recall = (combined.get("historicalWrongKeys") or {}).get("rate")
    false_rate = (combined.get("knownGoodFalseFlags") or {}).get("rate")
    if recall is None or recall < RECALL_BAR:
        reasons.append(f"historical wrong-key recall {recall} is below {RECALL_BAR:.2f}")
    if false_rate is None or false_rate >= 0.2:
        reasons.append(f"known-good false-flag rate {false_rate} is not below 0.20")
    if not combined.get("go") and not reasons:
        reasons.append("report go flag is false")
    return reasons


def validate_pr_batch(changes: list[dict[str, Any]], changed_paths: Iterable[str]) -> dict[str, Any]:
    """Check a fix PR against the #727 shape: one set, one change class, at most 25 items, item and registry paths only."""
    problems: list[str] = []
    if not changes:
        problems.append("no changes listed")
    sets = {str(change.get("set", "")) for change in changes}
    classes = {str(change.get("changeClass", "")) for change in changes}
    if len(sets) > 1 or "" in sets:
        problems.append(f"a PR covers exactly one set, found {sorted(sets)}")
    if len(classes) > 1 or not classes <= {"A", "B", "C"}:
        problems.append(f"a PR covers exactly one change class A, B or C, found {sorted(classes)}")
    item_ids = [str(change.get("itemId")) for change in changes]
    if len(set(item_ids)) != len(item_ids):
        problems.append("an item may appear once per PR")
    if len(item_ids) > PILOT_MAX_CHANGED_ITEMS:
        problems.append(f"{len(item_ids)} changed items exceed the cap of {PILOT_MAX_CHANGED_ITEMS}")
    outside = sorted(path for path in changed_paths if not path.replace("\\", "/").startswith(PILOT_ALLOWED_PREFIXES))
    if outside:
        problems.append(f"paths outside data/seed-source/items and _registry: {outside[:5]}")
    return {"ok": not problems, "problems": problems, "ownerReviewRequired": bool(classes & {"B", "C"})}


def recheck_sample(fix_item_ids: list[str], seed: str, size: int = 30) -> dict[str, Any]:
    """Pick the fixes a fresh reviewer rechecks. A shortfall is reported, not padded."""
    import hashlib

    ranked = sorted(dict.fromkeys(fix_item_ids), key=lambda item_id: hashlib.sha256(f"{seed}:{item_id}".encode("utf-8")).hexdigest())
    chosen = ranked[:size]
    return {"requested": size, "available": len(ranked), "selected": chosen, "shortfall": max(0, size - len(ranked)), "seed": seed}
