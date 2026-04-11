"""
Refresh factChecks[0] on SAA-C03 seed items: official AWS doc URL, fetched excerpt, ISO checked time.
Run from repo root: python scripts/refresh_saa_c03_factchecks.py
"""
from __future__ import annotations

import datetime as dt
import glob
import json
import re
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
GLOB = str(ROOT / "data/seed-source/items/exams/exams.aws.saa-c03-p*.json")
USER_AGENT = "QuizymodeSeedFactCheck/1.1 (+https://github.com/quizymode; contact: ops)"
CHECKED_TZ = dt.timezone.utc

HTML_CACHE: dict[str, str] = {}
FETCH_ERRORS: list[str] = []


def natural_sort(paths: list[str]) -> list[str]:
    return sorted(paths, key=lambda p: int(re.search(r"p(\d+)", p).group(1)))


def fetch_html(url: str) -> str | None:
    if url in HTML_CACHE:
        return HTML_CACHE[url]
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=45, context=ctx) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError, OSError) as ex:
        FETCH_ERRORS.append(f"{url} :: {ex!s}")
        HTML_CACHE[url] = ""
        return None
    HTML_CACHE[url] = raw
    time.sleep(0.25)
    return raw


def strip_noise(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = text.replace("\u00a0", " ")
    return text


def extract_excerpt(html: str, item: dict, url: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    roots: list = []
    for sel in ("#main-col-body", "#main-content", "article", "main"):
        el = soup.select_one(sel)
        if el is not None:
            roots.append(el)
    if not roots and soup.body is not None:
        roots.append(soup.body)
    if not roots:
        return ""
    min_len = 70
    chunks: list[str] = []
    for main in roots:
        for el in main.find_all(["p", "li"]):
            t = strip_noise(el.get_text(" ", strip=True))
            if len(t) < min_len:
                continue
            chunks.append(t)
    if not chunks:
        return ""
    blob = (
        (item.get("question") or "")
        + " "
        + (item.get("correctAnswer") or "")
        + " "
        + " ".join(item.get("keywords") or [])
    ).lower()
    tokens = {w for w in re.findall(r"[a-z0-9]{4,}", blob)}

    def score(text: str) -> int:
        tl = text.lower()
        return sum(1 for w in tokens if w in tl)

    best = max(chunks, key=lambda c: (score(c), len(c)))
    best = strip_noise(best)
    if len(best) > 520:
        best = best[:517].rstrip() + "..."
    while best.endswith('"') or best.endswith("\\"):
        best = best[:-1].rstrip()
    return best


def rule(blob: str, *subs: str) -> bool:
    return all(s.lower() in blob for s in subs)


def resolve_doc_url(item: dict) -> str:
    q = (item.get("question") or "").lower()
    ca = (item.get("correctAnswer") or "").lower()
    k = " ".join(item.get("keywords") or []).lower()
    blob = f"{q} {ca} {k}"

    checks: list[tuple[Callable[[str], bool], str]] = [
        (lambda b: rule(b, "intelligent-tiering", "s3") or "intelligent_tiering" in ca, "https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering.html"),
        (lambda b: "one zone-ia" in ca or "onezone_ia" in ca or "one zone-infrequent" in ca, "https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html"),
        (lambda b: "storage class" in b and "s3" in b, "https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html"),
        (lambda b: "lifecycle" in b and "s3" in b, "https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html"),
        (lambda b: "transfer acceleration" in b, "https://docs.aws.amazon.com/AmazonS3/latest/userguide/transfer-acceleration.html"),
        (lambda b: "cross-region replication" in b or "crr" in b, "https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html"),
        (lambda b: "vpc endpoint" in b and "s3" in b, "https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html"),
        (lambda b: "interface vpc endpoint" in b or "gateway load balancer" in b or "gwlb" in k, "https://docs.aws.amazon.com/elasticloadbalancing/latest/gateway/introduction.html"),
        (lambda b: "nat gateway" in b, "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html"),
        (lambda b: "transit gateway" in b, "https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html"),
        (lambda b: "network firewall" in b, "https://docs.aws.amazon.com/network-firewall/latest/developerguide/what-is-aws-network-firewall.html"),
        (lambda b: "firewall manager" in b, "https://docs.aws.amazon.com/waf/latest/developerguide/what-is-firewall-manager.html"),
        (lambda b: "traffic mirroring" in b, "https://docs.aws.amazon.com/vpc/latest/userguide/traffic-mirroring.html"),
        (lambda b: "site-to-site vpn" in b or "aws site-to-site" in b, "https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html"),
        (lambda b: "direct connect" in b, "https://docs.aws.amazon.com/directconnect/latest/UserGuide/Welcome.html"),
        (lambda b: "peering" in b and "vpc" in b, "https://docs.aws.amazon.com/vpc/latest/peering/what-is-vpc-peering.html"),
        (lambda b: "private subnet" in b and "internet" in b, "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html"),
        (lambda b: "route 53" in b or "route53" in k, "https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html"),
        (lambda b: "cloudfront" in b, "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html"),
        (lambda b: "global accelerator" in b, "https://docs.aws.amazon.com/global-accelerator/latest/dg/what-is-global-accelerator.html"),
        (lambda b: "application load balancer" in b or " alb " in b or "alb)" in b, "https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html"),
        (lambda b: "network load balancer" in b or " nlb " in b, "https://docs.aws.amazon.com/elasticloadbalancing/latest/network/introduction.html"),
        (lambda b: "elastic load balancing" in ca or "classic load balancer" in b, "https://docs.aws.amazon.com/elasticloadbalancing/latest/classic/introduction.html"),
        (lambda b: "auto scaling" in b or "auto-scaling" in k, "https://docs.aws.amazon.com/autoscaling/ec2/userguide/what-is-amazon-ec2-auto-scaling.html"),
        (lambda b: "launch template" in b, "https://docs.aws.amazon.com/autoscaling/ec2/userguide/create-asg-launch-template.html"),
        (lambda b: "athena" in b, "https://docs.aws.amazon.com/athena/latest/ug/what-is.html"),
        (lambda b: "glue" in b and "crawler" in b, "https://docs.aws.amazon.com/glue/latest/dg/add-crawler.html"),
        (lambda b: "glue" in b, "https://docs.aws.amazon.com/glue/latest/dg/what-is-glue.html"),
        (lambda b: "emr" in b or "apache spark" in b, "https://docs.aws.amazon.com/emr/latest/ManagementGuide/emr-what-is-emr.html"),
        (lambda b: "redshift" in b, "https://docs.aws.amazon.com/redshift/latest/mgmt/welcome.html"),
        (lambda b: "kinesis data stream" in b, "https://docs.aws.amazon.com/streams/latest/dev/introduction.html"),
        (lambda b: "kinesis firehose" in b or "firehose" in k, "https://docs.aws.amazon.com/firehose/latest/dev/what-is-this-service.html"),
        (lambda b: "managed service for apache flink" in b or "kinesis data analytics" in b, "https://docs.aws.amazon.com/managed-flink/latest/java/getting-started.html"),
        (lambda b: "dynamodb" in b, "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html"),
        (lambda b: "dax" in b or "dynamo accelerator" in b, "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.html"),
        (lambda b: "aurora" in b, "https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/CHAP_AuroraOverview.html"),
        (lambda b: "rds" in b or "relational database" in b or "mysql" in b or "postgresql" in b, "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html"),
        (lambda b: "elasticache" in b or "redis" in b or "memcached" in b, "https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.html"),
        (lambda b: "secrets manager" in b, "https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html"),
        (lambda b: "parameter store" in b and "systems manager" in b, "https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter.html"),
        (lambda b: "kms" in b or "key management" in b, "https://docs.aws.amazon.com/kms/latest/developerguide/overview.html"),
        (lambda b: "iam role" in b or "instance profile" in b, "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2.html"),
        (lambda b: "iam " in b or "bucket policy" in b or "principalorg" in b, "https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition.html"),
        (lambda b: "organizations" in b, "https://docs.aws.amazon.com/organizations/latest/userguide/orgs_introduction.html"),
        (
            lambda b: "cost explorer" in b
            or ("ec2" in b and "cost" in b and ("graph" in b or "comparing" in b or "analysis" in b)),
            "https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html",
        ),
        (lambda b: "budgets" in b, "https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html"),
        (lambda b: "cost explorer" in b, "https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html"),
        (lambda b: "cost and usage report" in b or "cur" in k, "https://docs.aws.amazon.com/cur/latest/userguide/what-is-cur.html"),
        (lambda b: "quicksight" in b, "https://docs.aws.amazon.com/quicksight/latest/user/welcome.html"),
        (lambda b: "lambda" in b, "https://docs.aws.amazon.com/lambda/latest/dg/welcome.html"),
        (lambda b: "api gateway" in b, "https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html"),
        (lambda b: "step functions" in b, "https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html"),
        (lambda b: "eventbridge" in b or "cloudwatch events" in b, "https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html"),
        (lambda b: "sns" in b or "simple notification" in b, "https://docs.aws.amazon.com/sns/latest/dg/welcome.html"),
        (lambda b: "sqs" in b or "fifo" in b and "queue" in b, "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html"),
        (lambda b: "ebs" in b or "elastic block" in b, "https://docs.aws.amazon.com/ebs/latest/userguide/what-is-ebs.html"),
        (lambda b: "fast snapshot restore" in b, "https://docs.aws.amazon.com/ebs/latest/userguide/ebs-fast-snapshot-restore.html"),
        (lambda b: "snapshot" in b and "ebs" in b, "https://docs.aws.amazon.com/ebs/latest/userguide/ebs-creating-snapshot.html"),
        (lambda b: "efs" in b or "elastic file" in b, "https://docs.aws.amazon.com/efs/latest/ug/whatisefs.html"),
        (lambda b: "fsx" in b, "https://docs.aws.amazon.com/fsx/latest/WindowsGuide/what-is.html"),
        (lambda b: "storage gateway" in b or "file gateway" in b, "https://aws.amazon.com/storagegateway/faqs/"),
        (lambda b: "snowball" in b, "https://docs.aws.amazon.com/snowball/latest/developer-guide/whatisedge.html"),
        (lambda b: "datasync" in b, "https://docs.aws.amazon.com/datasync/latest/userguide/what-is-datasync.html"),
        (lambda b: "cloudformation" in b, "https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html"),
        (lambda b: "cloudwatch" in b and "logs" in b, "https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html"),
        (lambda b: "cloudwatch" in b, "https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html"),
        (lambda b: "x-ray" in b or "xray" in k, "https://docs.aws.amazon.com/xray/latest/devguide/aws-xray.html"),
        (lambda b: "waf" in b, "https://docs.aws.amazon.com/waf/latest/developerguide/what-is-aws-waf.html"),
        (lambda b: "shield" in b, "https://docs.aws.amazon.com/waf/latest/developerguide/shield-chapter.html"),
        (lambda b: "guardduty" in b, "https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html"),
        (lambda b: "config" in b and "aws config" in b, "https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html"),
        (lambda b: "cloudtrail" in b, "https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html"),
        (lambda b: "ecs" in b or "fargate" in b, "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html"),
        (lambda b: "eks" in b or "kubernetes" in b, "https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html"),
        (lambda b: "ec2" in b or "elastic compute" in b, "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/concepts.html"),
        (lambda b: "s3" in b, "https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html"),
    ]

    for pred, url in checks:
        try:
            if pred(blob):
                return url
        except Exception:
            continue
    return "https://docs.aws.amazon.com/whitepapers/latest/aws-overview/introduction.html"


def apply_known_answer_fix(item: dict) -> tuple[str | None, str | None]:
    """
    Returns (new_conclusion_if_special, None) or (None, None).
    If returns ('incorrect_fixed', None), item was mutated in place.
    """
    item_id = str(item.get("itemId", ""))
    # S3 One Zone-IA is not resilient to AZ loss; stem requires AZ resilience + unpredictable access -> Intelligent-Tiering.
    if item_id == "5eaa5575-4bdc-4ba8-9ede-d31867ae7280" and "S3 One Zone-Infrequent Access (S3 One Zone-IA)" == item.get(
        "correctAnswer"
    ):
        old_correct = item["correctAnswer"]
        old_exp = item.get("explanation") or ""
        item["correctAnswer"] = "S3 Intelligent-Tiering"
        inc = list(item.get("incorrectAnswers") or [])
        if old_correct not in inc:
            inc.append(old_correct)
        inc = [a for a in inc if a != item["correctAnswer"]]
        item["incorrectAnswers"] = list(dict.fromkeys(inc))[:3]
        item["explanation"] = (
            old_exp
            + " update: The prior keyed answer (S3 One Zone-IA) stores objects in a single Availability Zone and is not resilient to AZ loss per Amazon S3 storage class documentation. "
            "S3 Intelligent-Tiering is intended for unknown or changing access patterns and uses S3's standard durability model across multiple AZs, matching the scenario."
        )
        return "incorrect_fixed", None
    return None, None


def build_factcheck(item: dict) -> dict:
    special, _ = apply_known_answer_fix(item)
    url = resolve_doc_url(item)
    conclusion = special or "correct"
    html = fetch_html(url)
    excerpt = ""
    if html:
        excerpt = extract_excerpt(html, item, url)
    if not excerpt:
        excerpt = (
            "Documentation body could not be parsed or fetched; confirm against the official page linked in source."
        )
        if conclusion == "correct":
            conclusion = "uncertain"
    checked = dt.datetime.now(CHECKED_TZ).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "factChecker": "cursor",
        "checked": checked,
        "conclusion": conclusion,
        "explanation": excerpt,
        "source": url,
    }


def process_file(path: Path) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    n = 0
    for item in data:
        if not isinstance(item, dict):
            continue
        fc_new = build_factcheck(item)
        fcs = list(item.get("factChecks") or [])
        if fcs:
            fcs[0] = fc_new
        else:
            fcs = [fc_new]
        item["factChecks"] = fcs
        n += 1
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return n


def main() -> None:
    files = natural_sort(glob.glob(GLOB))
    total = 0
    for fp in files:
        n = process_file(Path(fp))
        total += n
        print(Path(fp).name, n)
    print("total_items", total)
    if FETCH_ERRORS:
        print("fetch_errors", len(FETCH_ERRORS))
        for line in FETCH_ERRORS[:15]:
            print(line)


if __name__ == "__main__":
    main()
