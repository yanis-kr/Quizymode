"""
1) Targeted audit fixes (wrong keyed answers / mismatched citations).
2) Replace leading generic filler before UPD260411 with a short coherent stem + doc hook.

Run: python scripts/saa_c03_coherent_explain_and_audit.py
"""
from __future__ import annotations

import datetime as dt
import glob
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GLOB = str(ROOT / "data/seed-source/items/exams/exams.aws.saa-c03-p*.json")
GENERIC = "This answer applies the AWS services and patterns described in AWS documentation for the scenario."
CHECKED = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def natural_sort(paths: list[str]) -> list[str]:
    return sorted(paths, key=lambda p: int(re.search(r"p(\d+)", p).group(1)))


def question_oneliner(question: str, max_words: int = 44) -> str:
    words = (question or "").replace("\n", " ").split()
    if len(words) <= max_words:
        return " ".join(words).strip()
    return " ".join(words[:max_words]).rstrip(",;:") + "..."


def first_sentence_from_doc(doc_text: str) -> str:
    doc_text = re.sub(r"\s+", " ", doc_text).strip()
    for sep in (". ", "! ", "? "):
        idx = doc_text.find(sep)
        if 45 <= idx <= 450:
            return doc_text[: idx + 1].strip()
    if len(doc_text) <= 300:
        return doc_text
    return doc_text[:280].rsplit(" ", 1)[0] + "..."


def parse_upd(explanation: str) -> tuple[str, str] | None:
    if "\nUPD260411:" not in explanation:
        return None
    lead, rest = explanation.split("\nUPD260411:", 1)
    return lead.strip(), "UPD260411: " + rest.strip()


def extract_doc_and_url(upd_line: str) -> tuple[str, str] | None:
    m = re.match(r"UPD260411:\s*(.+)\s+\((https?://[^)]+)\)\s*$", upd_line, re.S)
    if not m:
        return None
    return m.group(1).strip(), m.group(2).strip()


def set_fc0(item: dict, conclusion: str, text: str, url: str) -> None:
    fcs = list(item.get("factChecks") or [])
    if not fcs:
        fcs = [{}]
    fcs[0] = {
        "factChecker": "cursor",
        "checked": CHECKED,
        "conclusion": conclusion,
        "explanation": text[:2000],
        "source": url,
    }
    item["factChecks"] = fcs


def apply_audit_fixes(item: dict) -> bool:
    iid = str(item.get("itemId", ""))

    if iid == "6744dd20-cfec-4c5c-9344-16455f3216f6":
        desired = [
            "Add an explicit rule to the private subnet's network ACL to allow traffic from the web tier's EC2 instances.",
            "Add a route in the VPC route table to allow traffic between the web tier's EC2 instances and the database tier.",
            "Deploy the web tier's EC2 instances and the database tier's RDS instance into two separate VPCs, and configure VPC peering.",
        ]
        if item.get("incorrectAnswers") == desired:
            return False
        item["incorrectAnswers"] = desired
        return True

    if iid == "0b5f0cdc-ac91-4b64-8591-e9270e600342":
        new_ca = "Implement Amazon ElastiCache to cache the large datasets."
        old_ca = item["correctAnswer"]
        if old_ca == new_ca:
            return False
        inc = [a for a in item.get("incorrectAnswers", []) if a != new_ca]
        if old_ca not in inc:
            inc.append(old_ca)
        item["correctAnswer"] = new_ca
        item["incorrectAnswers"] = list(dict.fromkeys(inc))[:3]
        upd_doc = (
            "Amazon ElastiCache is a web service that makes it easy to set up, manage, and scale a distributed in-memory cache environment in the cloud. "
            "It can improve application performance by moving information from slower disk-based databases to faster in-memory storage."
        )
        item["explanation"] = (
            "Repeated reads of the same database result set should be offloaded to a fast in-memory cache in front of RDS, reducing database load.\n\n"
            "update: The prior choice suggested Amazon SNS for storing database calls; SNS is a messaging service, not a query cache.\n"
            f"UPD260411: {upd_doc} (https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.html)"
        )
        set_fc0(
            item,
            "incorrect_fixed",
            upd_doc,
            "https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.html",
        )
        return True

    if iid == "eb4b4e61-dafc-4531-9abd-c553b7a570c1":
        new_ca = (
            "Use the Amazon Elastic File System (Amazon EFS) Standard storage class. "
            "Create a lifecycle management policy to move infrequently accessed data to EFS Standard-Infrequent Access (EFS Standard-IA)."
        )
        if item.get("correctAnswer") == new_ca:
            return False
        old_ca = item["correctAnswer"]
        inc = [a for a in item.get("incorrectAnswers", []) if a != new_ca]
        if old_ca not in inc:
            inc.append(old_ca)
        item["correctAnswer"] = new_ca
        item["incorrectAnswers"] = list(dict.fromkeys(inc))[:3]
        upd_doc = (
            "Amazon EFS provides simple, scalable file storage for use with Amazon EC2. "
            "With Amazon EFS, storage capacity is elastic, growing and shrinking automatically as you add and remove files."
        )
        item["explanation"] = (
            "The workload needs POSIX-compliant shared storage across Linux instances in multiple Availability Zones, with lifecycle savings after 30 days. "
            "Amazon EFS Standard with lifecycle to EFS Standard-IA matches that pattern.\n\n"
            "update: The prior choice used Amazon S3 with lifecycle to Glacier; S3 is object storage and is not mounted as a shared POSIX file system across EC2 instances.\n"
            f"UPD260411: {upd_doc} (https://docs.aws.amazon.com/efs/latest/ug/whatisefs.html)"
        )
        set_fc0(
            item,
            "incorrect_fixed",
            upd_doc,
            "https://docs.aws.amazon.com/efs/latest/ug/whatisefs.html",
        )
        return True

    if iid == "5ec88e5a-f48e-44ba-ad38-ccc8a786404d":
        new_ca = (
            "Create a security group for the web servers and allow port 443 from the load balancer. "
            "Create a security group for the MySQL servers and allow port 3306 from the web servers security group."
        )
        if item.get("correctAnswer") == new_ca:
            return False
        old_ca = item["correctAnswer"]
        inc = [a for a in item.get("incorrectAnswers", []) if a != new_ca]
        if old_ca not in inc:
            inc.append(old_ca)
        item["correctAnswer"] = new_ca
        item["incorrectAnswers"] = list(dict.fromkeys(inc))[:3]
        upd_doc = (
            "A security group acts as a virtual firewall for your associated AWS resource to control inbound and outbound traffic. "
            "Security groups operate at the account level (per Region, per VPC)."
        )
        item["explanation"] = (
            "The web tier should accept HTTPS only from the load balancer, and the database should accept MySQL only from the web tier security groups.\n\n"
            "update: The prior choice allowed HTTPS to the web tier from 0.0.0.0/0, which is wider than necessary once an internet-facing load balancer fronts the application.\n"
            f"UPD260411: {upd_doc} (https://docs.aws.amazon.com/vpc/latest/userguide/security-groups.html)"
        )
        set_fc0(
            item,
            "incorrect_fixed",
            upd_doc,
            "https://docs.aws.amazon.com/vpc/latest/userguide/security-groups.html",
        )
        return True

    if iid == "6744dd20-cfec-4c5c-9344-16455f3216f6":
        new_ca = (
            "Add an inbound rule to the security group of the database tier's RDS instance to allow traffic from the web tiers security group."
        )
        old_ca = item["correctAnswer"]
        inc = [a for a in item.get("incorrectAnswers", []) if a != new_ca]
        if old_ca not in inc:
            inc.append(old_ca)
        item["correctAnswer"] = new_ca
        item["incorrectAnswers"] = list(dict.fromkeys(inc))[:3]
        upd_doc = (
            "Security groups are associated with network interfaces. You can assign multiple security groups to an instance; "
            "each security group contains rules that control traffic for the instance."
        )
        item["explanation"] = (
            "With default VPC networking, the database security group typically does not allow inbound MySQL from the web tier security group, so connections fail even when the database is healthy.\n\n"
            "update: The prior choice focused on subnet NACLs; the usual first fix is to authorize the database security group for traffic from the web tier security group.\n"
            f"UPD260411: {upd_doc} (https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html)"
        )
        set_fc0(
            item,
            "incorrect_fixed",
            upd_doc,
            "https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html",
        )
        return True

    if iid == "8025f011-d8a4-4ef1-bfc7-2d392c0dd319":
        new_ca = (
            "Retain the latest Amazon Machine Images (AMIs) of the web and application tiers. "
            "Enable automated backups in Amazon RDS and use point-in-time recovery to meet the RPO."
        )
        if item.get("correctAnswer") == new_ca:
            return False
        old_ca = item["correctAnswer"]
        inc = [a for a in item.get("incorrectAnswers", []) if a != new_ca]
        if old_ca not in inc:
            inc.append(old_ca)
        item["correctAnswer"] = new_ca
        item["incorrectAnswers"] = list(dict.fromkeys(inc))[:3]
        upd_doc = (
            "Amazon RDS creates and saves automated backups of your DB instance during the backup window of your DB instance. "
            "RDS creates a storage volume snapshot of your DB instance, backing up the entire DB instance and not just individual databases."
        )
        item["explanation"] = (
            "The web and application tiers are stateless without required local data, so durable recovery is best anchored on golden AMIs plus database backups rather than blanket EBS volume snapshots of ephemeral instances.\n\n"
            "update: The prior choice relied on frequent EBS snapshots of EC2 volumes for a stateless Auto Scaling fleet, which is usually unnecessary and not the most resource-efficient path to a 2-hour database RPO.\n"
            f"UPD260411: {upd_doc} (https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html)"
        )
        set_fc0(
            item,
            "incorrect_fixed",
            upd_doc,
            "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html",
        )
        return True

    if iid == "1a258190-34eb-4de7-98a8-467366116d8b":
        if "Overview.RDSSecurityGroups.html" in (item.get("explanation") or ""):
            return False
        sp = parse_upd(item.get("explanation") or "")
        if not sp:
            return False
        lead, _old_upd = sp
        upd_doc = (
            "You can use a security group to control which resources can access your Amazon RDS DB instances. "
            "For example, you might set up network controls on your web server so that it can access a database instance."
        )
        item["explanation"] = (
            lead.rstrip()
            + f"\nUPD260411: {upd_doc} (https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.RDSSecurityGroups.html)"
        )
        set_fc0(
            item,
            "correct",
            upd_doc,
            "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.RDSSecurityGroups.html",
        )
        return True

    return False


def _meaningful_tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]{4,}", (text or "").lower()) if t not in STOP}


STOP = frozenset(
    {
        "amazon",
        "aws",
        "your",
        "with",
        "that",
        "this",
        "from",
        "into",
        "each",
        "when",
        "what",
        "which",
        "their",
        "there",
        "these",
        "those",
        "about",
        "after",
        "before",
        "between",
        "within",
        "without",
    }
)


def _doc_hook_sentence(doc_text: str, ca: str, question: str) -> str:
    """Pick a doc sentence related to the keyed answer; else short generic hook."""
    ca_toks = _meaningful_tokens(ca)
    q_toks = _meaningful_tokens(question)
    want = ca_toks | q_toks
    parts = re.split(r"(?<=[.!?])\s+", doc_text.strip())
    for p in parts:
        p = p.strip()
        if len(p) < 40:
            continue
        if _meaningful_tokens(p) & want:
            return p if len(p) <= 360 else p[:357].rsplit(" ", 1)[0] + "..."
    fs = first_sentence_from_doc(doc_text)
    if _meaningful_tokens(fs) & want:
        return fs
    return ""


def refine_generic_lead(item: dict) -> bool:
    exp = item.get("explanation") or ""
    sp = parse_upd(exp)
    if not sp:
        return False
    lead, upd_line = sp
    parsed = extract_doc_and_url(upd_line)
    if not parsed:
        return False
    doc_text, _u = parsed
    ca = (item.get("correctAnswer") or "").strip()
    qn = item.get("question") or ""
    hook = _doc_hook_sentence(doc_text, ca, qn)

    stripped = lead.strip()
    if stripped.startswith(GENERIC):
        remainder = stripped[len(GENERIC) :].lstrip()
    elif stripped == GENERIC:
        remainder = ""
    else:
        if len(stripped) > 110:
            return False
        if GENERIC not in stripped:
            return False
        remainder = stripped.replace(GENERIC, "", 1).strip()

    q = question_oneliner(qn)
    ca_clean = ca.rstrip().rstrip(".")
    if hook:
        coherent = f"{q} The best-matching choice is {ca_clean}. {hook}".strip()
    else:
        coherent = f"{q} The best-matching choice is {ca_clean}.".strip()
    if remainder:
        coherent = coherent + "\n\n" + remainder

    coherent = re.sub(r"([a-zA-Z0-9])\.\.(?=\s)", r"\1.", coherent)
    item["explanation"] = coherent + "\n" + upd_line
    return True


def process_file(path: Path) -> tuple[int, int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    audit_n = refine_n = 0
    for item in data:
        if not isinstance(item, dict):
            continue
        if apply_audit_fixes(item):
            audit_n += 1
        if refine_generic_lead(item):
            refine_n += 1
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return audit_n, refine_n


def main() -> None:
    ta = tr = 0
    for fp in natural_sort(glob.glob(GLOB)):
        a, r = process_file(Path(fp))
        ta += a
        tr += r
        print(Path(fp).name, "audit", a, "refine", r)
    print("totals", ta, tr)


if __name__ == "__main__":
    main()
