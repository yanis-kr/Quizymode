"""One-off: dedupe geography seed keywords (run from repo root)."""
from __future__ import annotations

import glob
import json
import os
import re
from typing import Optional

ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "bulk-seed", "geography")


def slug(s: str) -> Optional[str]:
    t = re.sub(r"[^a-z0-9]+", "-", s.strip().lower())
    t = t.strip("-")
    return t[:48] if t else None


def extract_entity(question: str) -> Optional[str]:
    if not question:
        return None
    m = re.search(r"national capital of\s+([^?]+)\?", question, re.I)
    if m:
        return slug(m.group(1))
    m = re.search(r"^What is the capital of\s+([^?]+)\?", question, re.I)
    if m:
        return slug(m.group(1))
    m = re.search(r"most populous in\s+([^?]+)\?", question, re.I)
    if m:
        return slug(m.group(1))
    return None


def consolidate(item: dict) -> list[str]:
    n1 = item.get("navigationKeyword1") or ""
    n2 = item.get("navigationKeyword2") or ""
    old = [k for k in (item.get("keywords") or []) if isinstance(k, str)]
    ent = extract_entity(item.get("question", ""))
    seq: list[str] = []
    for k in [n2, ent] + old + [n1]:
        if not k or k == "capitals":
            continue
        if k in seq:
            continue
        seq.append(k)
    pad = ["geography", "world", "places"]
    i = 0
    while len(seq) < 3:
        p = pad[i % len(pad)]
        i += 1
        if p not in seq:
            seq.append(p)
    return seq[:3]


def main() -> None:
    paths = sorted(glob.glob(os.path.join(ROOT, "*.json")))
    for path in paths:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for item in data:
            item["keywords"] = consolidate(item)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
    print(f"updated {len(paths)} files under geography")


if __name__ == "__main__":
    main()
