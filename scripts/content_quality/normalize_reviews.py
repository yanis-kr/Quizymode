#!/usr/bin/env python3
"""Convert model output plus its blind packet into validated ledger verdict input."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from seed_source_common import load_source_items  # noqa: E402


def normalize(packets: list[dict[str, Any]], results: list[dict[str, Any]], items: dict[str, Any]) -> list[dict[str, Any]]:
    packet_by_id = {str(packet["itemId"]): packet for packet in packets}
    normalized: list[dict[str, Any]] = []
    for result in results:
        item_id = str(result.get("itemId", ""))
        item = items.get(item_id)
        packet = packet_by_id.get(item_id)
        if item is None or packet is None:
            raise ValueError(f"{item_id}: no matching item and packet")
        level = result.get("level")
        status = "flagged"
        flags = list(result.get("flags") or [])
        if level == "L1":
            matches_key = result.get("answer") == item.correct_answer
            if not matches_key:
                flags.append("blind-answer-mismatch")
            if result.get("multipleDefensibleAnswers"):
                flags.append("multiple-defensible-answers")
            if matches_key and not result.get("multipleDefensibleAnswers"):
                status = "blind-agree"
        elif level == "L2":
            verdict = result.get("verdict")
            if verdict == "source-verified" and result.get("quote"):
                status = "source-verified"
            elif verdict == "evidence-gap":
                status = "unverified"
        elif level == "L3":
            if result.get("adjudication") == "supports-change":
                flags.append("independent-change-support")
            elif result.get("adjudication") == "weak":
                flags.append("weak-adjudication")
        else:
            raise ValueError(f"{item_id}: unsupported review level {level}")
        normalized.append({
            "itemId": item_id,
            "level": level,
            "status": status,
            "flags": sorted(set(flags)),
            "sourceUrl": packet.get("secondSourceUrl") if level == "L3" else packet.get("sourceUrl"),
            "quote": result.get("quote"),
            "checkedAt": result.get("checkedAt"),
            "checker": "codex-cli",
            "modelId": result.get("modelId"),
            "verdict": result.get("verdict"),
            "answer": result.get("answer"),
            "multipleDefensibleAnswers": result.get("multipleDefensibleAnswers"),
            "difficulty": result.get("difficulty"),
            "proposedFix": result.get("proposedFix"),
            "adjudication": result.get("adjudication"),
            "inputTokens": result.get("inputTokens"),
            "outputTokens": result.get("outputTokens"),
            "callId": result.get("callId"),
        })
    if set(packet_by_id) != {str(row.get("itemId")) for row in normalized}:
        raise ValueError("every packet must have exactly one review result")
    return normalized


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packets", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--category", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    items = {item.item_id: item for item in load_source_items() if item.category == args.category}
    packets = [json.loads(line) for line in args.packets.read_text(encoding="utf-8").splitlines() if line.strip()]
    results = [json.loads(line) for line in args.results.read_text(encoding="utf-8").splitlines() if line.strip()]
    verdicts = normalize(packets, results, items)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in verdicts), encoding="utf-8")
    print(f"normalized {len(verdicts)} verdicts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
