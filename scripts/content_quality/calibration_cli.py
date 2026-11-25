#!/usr/bin/env python3
"""Score calibration results and create per-set pilot summaries for #727."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from review_reports import calibration_report, pilot_gate, pilot_report, read_jsonl, recheck_sample, validate_pr_batch, write_json  # noqa: E402
from quality_lib import (  # noqa: E402
    CACHE_ROOT,
    QUALITY_ROOT,
    RUBRIC_VERSION,
    append_rows,
    cache_is_ok,
    content_hash,
    ingest,
    ledger_path,
    packet,
    read_cache,
    best_passage_scored,
    read_rows,
)
from normalize_reviews import normalize  # noqa: E402
from model_review import DEFAULT_MODELS, MAX_BATCH, run_packets  # noqa: E402
from fixture_tools import source_item  # noqa: E402

CALIBRATION_LEDGER = QUALITY_ROOT / "calibration.jsonl"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    packets = sub.add_parser("fixture-packets", help="build bounded reviewer packets from label-separated fixture items")
    packets.add_argument("--items", type=Path, required=True)
    packets.add_argument("--level", choices=("L1", "L2", "L3"), required=True)
    packets.add_argument("--budget", type=int, default=25)
    packets.add_argument("--seed", default="727")
    packets.add_argument("--output", type=Path, required=True)
    packets.set_defaults(func=cmd_fixture_packets)

    record = sub.add_parser("record-fixture", help="verify and record completed fixture reviews for resume")
    record.add_argument("--items", type=Path, required=True)
    record.add_argument("--packets", type=Path, required=True)
    record.add_argument("--results", type=Path, required=True)
    record.add_argument("--output", type=Path, required=True)
    record.set_defaults(func=cmd_record_fixture)

    run = sub.add_parser("run-fixture", help="run a resumable fixture review in calls of at most 25 items")
    run.add_argument("--items", type=Path, required=True)
    run.add_argument("--level", choices=("L1", "L2", "L3"), required=True)
    run.add_argument("--budget", type=int, default=25)
    run.add_argument("--seed", default="727")
    run.add_argument("--model")
    run.add_argument("--output", type=Path, required=True, help="append-only model results JSONL")
    run.set_defaults(func=cmd_run_fixture)

    calibration = sub.add_parser("calibration-report", help="score the committed fixture from the calibration ledger (no model calls)")
    calibration.add_argument("--labels", type=Path, default=QUALITY_ROOT / "calibration-fixture.jsonl")
    calibration.add_argument("--l1", type=Path, default=CALIBRATION_LEDGER, help="JSONL with L1 rows (default: calibration ledger)")
    calibration.add_argument("--l2", type=Path, default=CALIBRATION_LEDGER, help="JSONL with L2 rows (default: calibration ledger)")
    calibration.add_argument("--rubric-version", default=RUBRIC_VERSION)
    calibration.add_argument("--luna-model", default=DEFAULT_MODELS["L1"])
    calibration.add_argument("--sol-model", default=DEFAULT_MODELS["L2"])
    calibration.add_argument("--output", type=Path, default=QUALITY_ROOT / "calibration-report.json")
    calibration.add_argument("--require-go", action="store_true")
    calibration.set_defaults(func=cmd_calibration)

    pilot = sub.add_parser("pilot-report")
    pilot.add_argument("--category", required=True)
    pilot.add_argument("--set-name", required=True)
    pilot.add_argument("--item-ids", type=Path, required=True, help="one item id per line")
    pilot.add_argument("--output", type=Path, required=True)
    pilot.set_defaults(func=cmd_pilot)

    gate = sub.add_parser("pilot-gate", help="exit 1 unless the committed calibration report allows the pilot")
    gate.add_argument("--report", type=Path, default=QUALITY_ROOT / "calibration-report.json")
    gate.set_defaults(func=cmd_pilot_gate)

    pr = sub.add_parser("check-pr", help="check a fix batch for one set, one class, the item cap and allowed paths")
    pr.add_argument("--changes", type=Path, required=True, help="JSONL with itemId, set, changeClass, before and after")
    pr.add_argument("--base", default="origin/main")
    pr.set_defaults(func=cmd_check_pr)

    sample = sub.add_parser("recheck-sample", help="pick up to 30 pilot fixes for a fresh-context recheck")
    sample.add_argument("--changes", type=Path, required=True)
    sample.add_argument("--seed", default="727")
    sample.add_argument("--size", type=int, default=30)
    sample.set_defaults(func=cmd_recheck_sample)
    return parser


def choose_source(item, fixture_url, extras):
    """The cached page whose best passage overlaps the question and every option most; the fixture page wins ties.

    Source expansion (#727): extra eligible pages come from a blind model step, never from labels.
    """
    best_url, best_score = fixture_url, -1
    for url in [u for u in [fixture_url, *extras] if u]:
        cached = read_cache(url)
        if not cache_is_ok(cached):
            continue
        score, _ = best_passage_scored(cached.get("text", ""), item)
        if score > best_score:
            best_url, best_score = url, score
    return best_url


def cmd_fixture_packets(args: argparse.Namespace) -> int:
    if args.budget < 0 or args.budget > MAX_BATCH:
        raise ValueError(f"budget must be between 0 and {MAX_BATCH}")
    item_rows = read_jsonl(args.items)
    ledger = read_rows(CALIBRATION_LEDGER)
    extra_path = args.items.with_name("extra-sources.json")
    extra_sources: dict[str, list[str]] = json.loads(extra_path.read_text(encoding="utf-8")) if extra_path.exists() else {}
    current = {(row.get("itemId"), row.get("level"), row.get("rubricVersion")): row for row in ledger}
    packets: list[dict] = []
    manifest: list[dict] = []
    gaps: list[dict] = []
    considered = 0
    for row in item_rows:
        item = source_item(row)
        row_hash = content_hash(item)
        prior = current.get((item.item_id, args.level, RUBRIC_VERSION))
        chosen = choose_source(item, row.get("sourceUrl"), extra_sources.get(item.item_id, [])) if args.level == "L2" else row.get("sourceUrl")
        if prior and prior.get("contentHash") == row_hash and not (args.level == "L2" and extra_sources.get(item.item_id) and prior.get("sourceUrl") != chosen):
            cached = read_cache(prior.get("sourceUrl") or "") if prior.get("sourceUrl") else None
            old_hash = prior.get("sourceTextHash")
            current_hash = hashlib.sha256(cached.get("text", "").encode("utf-8")).hexdigest() if cache_is_ok(cached) else None
            if args.level == "L1" or old_hash and old_hash == current_hash:
                continue
        if len(packets) >= args.budget:
            break
        considered += 1
        source_url = chosen
        second_source_url = row.get("secondSourceUrl")
        if args.level in {"L2", "L3"}:
            cached = read_cache(source_url or "")
            if not cache_is_ok(cached):
                gaps.append({"itemId": item.item_id, "reason": "no cached eligible source"})
                continue
        findings = row.get("findings") if args.level == "L3" else None
        body = packet(item, args.level, args.seed, source_url=source_url, findings=findings, second_source_url=second_source_url)
        if args.level == "L3" and "secondPassage" not in body:
            gaps.append({"itemId": item.item_id, "reason": "no cached second eligible source"})
            continue
        packets.append(body)
        manifest.append({"itemId": item.item_id, "contentHash": row_hash, "level": args.level, "rubricVersion": RUBRIC_VERSION, "sourceUrl": second_source_url if args.level == "L3" else source_url})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("".join(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n" for value in packets), encoding="utf-8")
    args.output.with_suffix(".manifest.jsonl").write_text("".join(json.dumps(value, sort_keys=True) + "\n" for value in manifest), encoding="utf-8")
    write_json(args.output.with_suffix(".gaps.json"), {"items": gaps, "count": len(gaps)})
    print(json.dumps({"level": args.level, "budget": args.budget, "considered": considered, "packets": len(packets), "sourceGaps": len(gaps)}, sort_keys=True))
    return 0


def cmd_record_fixture(args: argparse.Namespace) -> int:
    item_rows = read_jsonl(args.items)
    packet_rows = read_jsonl(args.packets)
    results = read_jsonl(args.results)
    items = {row["itemId"]: source_item(row) for row in item_rows}
    verdicts = normalize(packet_rows, results, items)
    accepted, rejected = ingest(verdicts, items, cache_root=CACHE_ROOT)
    manifest_path = args.packets.with_suffix(".manifest.jsonl")
    manifest = {row["itemId"]: row for row in read_jsonl(manifest_path)}
    recorded = []
    for row in accepted:
        metadata = manifest.get(row["itemId"])
        if metadata is None:
            rejected.append(f"{row['itemId']}: missing fixture manifest row")
            continue
        row["contentHash"] = metadata["contentHash"]
        row["rubricVersion"] = metadata["rubricVersion"]
        recorded.append(row)
    append_rows(CALIBRATION_LEDGER, recorded)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in recorded), encoding="utf-8")
    write_json(args.output.with_suffix(".rejected.json"), {"rejected": rejected, "count": len(rejected)})
    print(f"recorded {len(recorded)}, rejected {len(rejected)}")
    return 1 if rejected else 0


def cmd_run_fixture(args: argparse.Namespace) -> int:
    """Run at most `--budget` items in total, in calls of at most MAX_BATCH. Completed rows are never rerun."""
    if args.budget < 1:
        raise ValueError("budget must be at least 1")
    item_rows = read_jsonl(args.items)
    items = {row["itemId"]: source_item(row) for row in item_rows}
    model = args.model or DEFAULT_MODELS[args.level]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    completed = 0
    started = 0
    gaps_by_id: dict[str, dict] = {}
    while started < args.budget:
        batch_number = completed + 1
        packets_path = args.output.with_name(f"{args.output.stem}.batch-{batch_number:03}.packets.jsonl")
        temp = argparse.Namespace(items=args.items, level=args.level, budget=min(MAX_BATCH, args.budget - started), seed=args.seed, output=packets_path)
        cmd_fixture_packets(temp)
        packets = read_jsonl(packets_path)
        gap_file = packets_path.with_suffix(".gaps.json")
        for gap in json.loads(gap_file.read_text(encoding="utf-8")).get("items", []):
            gaps_by_id[gap["itemId"]] = gap
        if not packets:
            break
        results = run_packets(args.level, packets, model, MAX_BATCH)
        started += len(packets)
        with args.output.open("a", encoding="utf-8", newline="\n") as stream:
            for result in results:
                stream.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + "\n")
        verdicts = normalize(packets, results, items)
        accepted, rejected = ingest(verdicts, items, cache_root=CACHE_ROOT)
        remaining_rejections: list[str] = []
        if rejected:
            quote_rejections = {
                message.split(":", 1)[0]: message
                for message in rejected
                if "quote not found in cached source text" in message or "source tier" in message
            }
            if quote_rejections:
                fallback = []
                for verdict in verdicts:
                    message = quote_rejections.get(verdict["itemId"])
                    if message:
                        unresolved = dict(verdict)
                        unresolved.update({
                            "status": "unverified",
                            "verdict": "evidence-gap",
                            "quote": None,
                            "flags": sorted(set([*verdict.get("flags", []), "quote-validation-failed"])),
                        })
                        fallback.append(unresolved)
                    else:
                        fallback.append(verdict)
                retried, remaining_rejections = ingest(fallback, items, cache_root=CACHE_ROOT)
                accepted.extend(row for row in retried if row["itemId"] in quote_rejections)
            else:
                remaining_rejections.extend(rejected)
        manifest = {row["itemId"]: row for row in read_jsonl(packets_path.with_suffix(".manifest.jsonl"))}
        for row in accepted:
            metadata = manifest.get(row["itemId"])
            if metadata is None:
                remaining_rejections.append(f"{row['itemId']}: missing fixture manifest row")
                continue
            row["contentHash"] = metadata["contentHash"]
            row["rubricVersion"] = metadata["rubricVersion"]
        append_rows(CALIBRATION_LEDGER, accepted)
        completed += 1
        call = results[0]
        print(json.dumps({
            "batch": completed,
            "level": args.level,
            "modelId": model,
            "items": len(results),
            "inputTokens": call.get("inputTokens"),
            "outputTokens": call.get("outputTokens"),
            "usageAvailable": call.get("usageAvailable"),
            "accepted": len(accepted),
            "rejected": remaining_rejections,
        }, sort_keys=True), flush=True)
        if remaining_rejections:
            return 1
    gap_path = args.output.with_suffix(".source-gaps.json")
    write_json(gap_path, {"count": len(gaps_by_id), "items": list(gaps_by_id.values())})
    print(json.dumps({"level": args.level, "budget": args.budget, "itemsStarted": started, "batches": completed, "sourceGaps": len(gaps_by_id), "gapReport": str(gap_path)}, sort_keys=True), flush=True)
    return 0


def cmd_calibration(args: argparse.Namespace) -> int:
    labels = read_jsonl(args.labels)
    label_ids = {str(row.get("itemId")) for row in labels}
    report = calibration_report(
        labels,
        [row for row in read_jsonl(args.l1) if str(row.get("itemId")) in label_ids],
        [row for row in read_jsonl(args.l2) if str(row.get("itemId")) in label_ids],
        args.rubric_version,
        {"L1": args.luna_model, "L2": args.sol_model},
    )
    write_json(args.output, report)
    print(json.dumps(report, sort_keys=True))
    return 1 if args.require_go and not report["combined"]["go"] else 0


def cmd_pilot(args: argparse.Namespace) -> int:
    rows = read_rows(ledger_path(args.category))
    item_ids = {line.strip() for line in args.item_ids.read_text(encoding="utf-8").splitlines() if line.strip()}
    report = pilot_report([row for row in rows if row.get("itemId") in item_ids], args.set_name)
    write_json(args.output, report)
    print(json.dumps(report, sort_keys=True))
    return 0


def cmd_pilot_gate(args: argparse.Namespace) -> int:
    if not args.report.exists():
        print(json.dumps({"go": False, "reasons": [f"no calibration report at {args.report}"]}))
        return 1
    reasons = pilot_gate(json.loads(args.report.read_text(encoding="utf-8")), RUBRIC_VERSION)
    print(json.dumps({"go": not reasons, "reasons": reasons}, sort_keys=True))
    return 1 if reasons else 0


def cmd_check_pr(args: argparse.Namespace) -> int:
    import subprocess

    changes = read_jsonl(args.changes)
    paths = subprocess.check_output(["git", "diff", "--name-only", f"{args.base}...HEAD"], text=True).splitlines()
    result = validate_pr_batch(changes, paths)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["ok"] else 1


def cmd_recheck_sample(args: argparse.Namespace) -> int:
    changes = read_jsonl(args.changes)
    print(json.dumps(recheck_sample([str(change["itemId"]) for change in changes], args.seed, args.size), sort_keys=True))
    return 0


if __name__ == "__main__":
    parsed = build_parser().parse_args()
    raise SystemExit(parsed.func(parsed))
