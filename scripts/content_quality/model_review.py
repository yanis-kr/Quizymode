#!/usr/bin/env python3
"""Run bounded, JSON-only content-review calls through the signed-in Codex CLI."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_MODELS = {"L1": "gpt-6-luna", "L2": "gpt-6-sol", "L3": "gpt-6-sol"}
MAX_BATCH = 25

PROMPTS = {
    "L1": """You are the blind answer reviewer for multiple-choice exam questions. The packets contain no key or explanation. Answer each question independently using only the question and options. Do not search, browse, or use tools. Return only a JSON array with one object per packet, exactly these fields: itemId (string), answer (exact option text), multipleDefensibleAnswers (boolean), difficulty (easy|medium|hard). If more than one answer is defensible, set the boolean true. Do not add rationale or any other fields.

Packets:\n""",
    "L2": """You are the source-grounded reviewer. Review each item against its supplied key, explanation, and bounded passage. The passage is the only evidence source. Do not search, browse, or use tools. Determine whether the key and explanation are supported, whether another option is also defensible, and whether a correction is needed. For verdict source-verified, include a short verbatim quote that supports the key. For any finding that needs a content or answer change, return a verbatim quote from the passage. If the passage cannot support a decision, use verdict evidence-gap and quote null. Do not invent citations or quotes. Return only a JSON array with one object per packet and exactly these fields: itemId, verdict (source-verified|key-mismatch|ambiguous|content-fix|evidence-gap), flags (array of short strings), quote (string|null), proposedFix (string|null), requiresL3 (boolean). Do not include chain-of-thought or rationale.

Packets:\n""",
    "L3": """You are an independent adjudicator. Treat each packet as a fresh case. Use the item and second source passage, plus only the structured prior findings. Do not use prior reviewers' prose or infer unstated evidence. Decide whether the proposed exam key or distractor change is supported. A supporting decision requires a verbatim quote from the second passage. If evidence is weak or unavailable, withhold support. Do not search, browse, or use tools. Return only a JSON array with one object per packet and exactly these fields: itemId, adjudication (supports-change|rejects-change|weak|evidence-gap), quote (string|null), verdict (supported|not-supported|unresolved). Do not include rationale.

Packets:\n""",
}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _validate_packets(level: str, packets: list[dict[str, Any]], budget: int) -> None:
    if budget < 0 or budget > MAX_BATCH:
        raise ValueError(f"budget must be between 0 and {MAX_BATCH}")
    if len(packets) > budget:
        raise ValueError(f"packet count {len(packets)} exceeds requested budget {budget}")
    if len({str(p.get("itemId")) for p in packets}) != len(packets):
        raise ValueError("packet itemId values must be unique within a call")
    for packet in packets:
        if packet.get("level") != level:
            raise ValueError(f"packet {packet.get('itemId')} has the wrong level")
        if level == "L1":
            allowed = {"itemId", "level", "question", "options", "shuffleSeed"}
            if set(packet) - allowed or "correctAnswer" in packet or "explanation" in packet:
                raise ValueError(f"L1 packet {packet.get('itemId')} contains key or explanation data")
        elif level == "L2":
            if not all(field in packet for field in ("correctAnswer", "explanation", "passage", "sourceUrl")):
                raise ValueError(f"L2 packet {packet.get('itemId')} lacks key, explanation or source passage")
        elif not all(field in packet for field in ("correctAnswer", "explanation", "secondPassage", "secondSourceUrl", "findings")):
            raise ValueError(f"L3 packet {packet.get('itemId')} lacks independent evidence")


def _parse_events(stdout: str) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    messages: list[dict[str, Any]] = []
    usage: dict[str, Any] | None = None
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "item.completed" and event.get("item", {}).get("type") == "agent_message":
            messages.append(event["item"])
        if event.get("type") == "turn.completed" and isinstance(event.get("usage"), dict):
            usage = event["usage"]
    if not messages:
        raise ValueError("Codex CLI returned no final message")
    text = messages[-1].get("text", "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE)
    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("["), text.rfind("]")
        if start < 0 or end < start:
            raise ValueError("model response was not a JSON array")
        result = json.loads(text[start:end + 1])
    if not isinstance(result, list):
        raise ValueError("model response must be a JSON array")
    return result, usage


def _run_call(level: str, model: str, packets: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    prompt = PROMPTS[level] + json.dumps(packets, ensure_ascii=False, separators=(",", ":"))
    with tempfile.TemporaryDirectory(prefix="qm-content-review-") as temp_dir:
        result = subprocess.run(
            ["codex", "exec", "--skip-git-repo-check", "--ephemeral", "--model", model, "--sandbox", "read-only", "--json", "-"],
            input=prompt,
            text=True,
            encoding="utf-8",
            capture_output=True,
            cwd=temp_dir,
            check=False,
        )
    if result.returncode:
        raise RuntimeError(f"Codex review call failed ({result.returncode}): {result.stderr.strip()[-1200:]}")
    outputs, usage = _parse_events(result.stdout)
    expected = {str(packet["itemId"]) for packet in packets}
    actual = [str(row.get("itemId")) for row in outputs]
    if set(actual) != expected or len(actual) != len(expected):
        raise ValueError("model response itemIds did not match the packet batch")
    return outputs, usage


def run_packets(level: str, packets: list[dict[str, Any]], model: str, budget: int) -> list[dict[str, Any]]:
    _validate_packets(level, packets, budget)
    if not packets:
        return []
    outputs, usage = _run_call(level, model, packets)
    call_id = str(uuid.uuid4())
    checked_at = datetime.now(timezone.utc).isoformat()
    call_input = usage.get("input_tokens") if usage and isinstance(usage.get("input_tokens"), int) else None
    call_output = usage.get("output_tokens") if usage and isinstance(usage.get("output_tokens"), int) else None
    for row in outputs:
        row.update({
            "level": level,
            "modelId": model,
            "callId": call_id,
            "checkedAt": checked_at,
            "inputTokens": call_input,
            "outputTokens": call_output,
            "usageAvailable": usage is not None,
        })
    return outputs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--level", choices=tuple(PROMPTS), required=True)
    parser.add_argument("--packets", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model")
    parser.add_argument("--budget", type=int, default=25)
    args = parser.parse_args(argv)
    packets = read_jsonl(args.packets)
    existing = read_jsonl(args.output) if args.output.exists() else []
    completed = {str(row.get("itemId")) for row in existing}
    pending = [packet for packet in packets if str(packet.get("itemId")) not in completed]
    _validate_packets(args.level, pending, args.budget)
    model = args.model or DEFAULT_MODELS[args.level]
    results = run_packets(args.level, pending, model, args.budget)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("a", encoding="utf-8", newline="\n") as stream:
        for row in results:
            stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    calls = {row["callId"]: row for row in results}
    measured_calls = [row for row in calls.values() if row.get("usageAvailable")]
    usage = {
        "level": args.level,
        "modelId": model,
        "items": len(results),
        "calls": len(calls),
        "inputTokens": sum(row.get("inputTokens") or 0 for row in measured_calls) if measured_calls else None,
        "outputTokens": sum(row.get("outputTokens") or 0 for row in measured_calls) if measured_calls else None,
        "usageAvailable": bool(results) and all(row.get("usageAvailable") for row in results),
    }
    print(json.dumps(usage, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
