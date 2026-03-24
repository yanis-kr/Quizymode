"""
Item-level keywords for SAA-C03 bulk seeds.

- Always include aws-saa-c03 (exam).
- Add up to two coarse domain tags (aws-storage, aws-compute, …).
- Add up to five specific technology slugs (aurora, s3, lambda, serverless, …).
- No generic padding tag (removed aws-solutions-architect).
"""

from __future__ import annotations

import re

EXAM_TAG = "aws-saa-c03"
MAX_DOMAIN_TAGS = 2
MAX_TECH_TAGS = 6

SAA_C03_SEED_SOURCE = (
    "https://github.com/Iamrushabhshahh/"
    "AWS-Certified-Solutions-Architect-Associate-SAA-C03-Exam-Dump-With-Solution"
)

_DB_TECH_SLUGS = frozenset(
    {
        "aurora",
        "rds",
        "dynamodb",
        "redshift",
        "elasticache",
        "dax",
        "mysql",
        "postgresql",
    }
)

# Coarse domains (unchanged intent).
DOMAIN_RULES: list[tuple[str, list[str]]] = [
    (
        "aws-storage",
        [
            r"\bs3\b",
            r"\bebs\b",
            r"\befs\b",
            r"\bfsx\b",
            r"glacier",
            r"snowball",
            r"snow ",
            "storage gateway",
            "datasync",
            r"\baws backup\b",
            "object lock",
            "lifecycle",
            "storage class",
            "multipart upload",
            "transfer acceleration",
        ],
    ),
    (
        "aws-database",
        [
            r"\brds\b",
            r"\baurora\b",
            r"\bdynamodb\b",
            r"\belasticache\b",
            r"\bdax\b",
            r"\bredshift\b",
            "read replica",
            "multi-az",
            "sql database",
        ],
    ),
    (
        "aws-compute",
        [
            r"\bec2\b",
            r"\blambda\b",
            r"\becs\b",
            r"\beks\b",
            r"\bfargate\b",
            "auto scaling",
            "elastic beanstalk",
            "capacity reservation",
            "spot instance",
            "launch template",
        ],
    ),
    (
        "aws-networking",
        [
            r"\bvpc\b",
            "subnet",
            r"\balb\b",
            r"\bnlb\b",
            "application load balancer",
            "network load balancer",
            "gateway load balancer",
            "elastic load balanc",
            r"\belb\b",
            "cloudfront",
            "route 53",
            r"\bdns\b",
            "global accelerator",
            "direct connect",
            r"\bvpn\b",
            "transit gateway",
            "private link",
            "vpc endpoint",
            "nat gateway",
            "internet gateway",
        ],
    ),
    (
        "aws-security",
        [
            r"\biam\b",
            r"\bkms\b",
            "secrets manager",
            "parameter store",
            r"\bwaf\b",
            r"\bshield\b",
            "guardduty",
            "macie",
            "inspector",
            "network firewall",
            "firewall manager",
            "cognito",
            "directory service",
            r"\bsso\b",
            "active directory",
            "mfa delete",
            "encryption key",
            "certificate manager",
            r"\bacm\b",
        ],
    ),
    (
        "aws-integration",
        [
            r"\bsqs\b",
            r"\bsns\b",
            "simple queue",
            "simple notification",
            "eventbridge",
            "cloudwatch events",
            "step functions",
            "api gateway",
            "appflow",
            "amazon mq",
        ],
    ),
    (
        "aws-analytics",
        [
            "athena",
            "aws glue",
            r"\bglue\b",
            r"\bemr\b",
            "kinesis",
            "quicksight",
            "opensearch",
            "elasticsearch",
            "data firehose",
            "data stream",
        ],
    ),
    (
        "aws-management",
        [
            "cloudwatch",
            "cloudtrail",
            r"\bconfig\b",
            "systems manager",
            "session manager",
            "patch manager",
            "organizations",
            "control tower",
            "service catalog",
            "budgets",
            "cost explorer",
            "cost and usage",
            "billing",
            "trusted advisor",
            "well-architected",
            "opsworks",
        ],
    ),
    (
        "aws-migration",
        [
            "application migration",
            r"\bmgn\b",
            "migration hub",
            "database migration",
            r"\bdms\b",
            "server migration",
        ],
    ),
]

# Short tech slugs for search (e.g. s3, aurora, lambda, serverless).
TECH_RULES: list[tuple[str, list[str]]] = [
    ("aurora", [r"\baurora\b"]),
    ("dynamodb", [r"\bdynamodb\b"]),
    ("rds", [r"\brds\b", "amazon rds"]),
    ("elasticache", [r"\belasticache\b", "memcached", "redis"]),
    ("redshift", [r"\bredshift\b"]),
    ("dax", [r"\bdax\b"]),
    ("s3", [r"\bs3\b", "simple storage service"]),
    ("ebs", [r"\bebs\b", "elastic block store"]),
    ("efs", [r"\befs\b", "elastic file system"]),
    ("fsx", [r"\bfsx\b"]),
    ("glacier", ["glacier deep archive", "glacier flexible", "s3 glacier", r"\bglacier\b"]),
    ("snowball", ["snowball", "snow edge"]),
    ("lambda", [r"\blambda\b"]),
    ("ec2", [r"\bec2\b"]),
    ("fargate", [r"\bfargate\b"]),
    ("ecs", [r"\becs\b"]),
    ("eks", [r"\beks\b"]),
    ("elastic-beanstalk", ["elastic beanstalk"]),
    ("auto-scaling", ["auto scaling group", "auto scaling", r"\bec2 auto scaling\b"]),
    ("api-gateway", ["api gateway"]),
    ("sqs", [r"\bsqs\b", "simple queue service"]),
    ("sns", [r"\bsns\b", "simple notification service"]),
    ("eventbridge", ["eventbridge", "cloudwatch events"]),
    ("step-functions", ["step functions"]),
    ("kinesis", [r"\bkinesis\b"]),
    ("athena", [r"\bathena\b"]),
    ("glue", [r"\bglue\b"]),
    ("emr", [r"\bemr\b"]),
    ("quicksight", [r"\bquicksight\b"]),
    ("opensearch", ["opensearch", "elasticsearch service"]),
    ("cloudfront", ["cloudfront"]),
    ("route53", ["route 53"]),
    ("vpc", [r"\bvpc\b"]),
    ("alb", ["application load balancer", r"\balb\b"]),
    ("nlb", ["network load balancer", r"\bnlb\b"]),
    ("gwlb", ["gateway load balancer", r"\bgwlb\b"]),
    ("global-accelerator", ["global accelerator"]),
    ("direct-connect", ["direct connect"]),
    ("transit-gateway", ["transit gateway"]),
    ("vpc-endpoint", ["vpc endpoint", "gateway endpoint", "interface endpoint"]),
    ("nat-gateway", ["nat gateway"]),
    ("site-to-site-vpn", ["site-to-site vpn", r"\bvpn connection\b"]),
    ("dns", [r"\bdns\b"]),
    ("iam", [r"\biam\b"]),
    ("kms", [r"\bkms\b", "key management service"]),
    ("secrets-manager", ["secrets manager"]),
    ("waf", [r"\bwaf\b"]),
    ("shield", [r"\bshield\b"]),
    ("cognito", [r"\bcognito\b"]),
    ("organizations", [r"\borganizations\b"]),
    ("aws-config", [r"\baws config\b", r"\bconfig rules\b"]),
    ("cloudwatch", ["cloudwatch"]),
    ("cloudtrail", ["cloudtrail"]),
    ("systems-manager", ["systems manager", "session manager", "patch manager"]),
    ("parameter-store", ["parameter store"]),
    ("datasync", ["datasync"]),
    ("aws-backup", [r"\baws backup\b"]),
    ("mq", ["amazon mq"]),
    ("appflow", ["appflow"]),
    ("dms", [r"\bdms\b", "database migration service"]),
    ("serverless", [r"\bserverless\b"]),
    ("mysql", [r"\bmysql\b"]),
    ("postgresql", [r"\bpostgresql\b", r"\bpostgres\b"]),
]

_DOMAIN_COMPILED: list[tuple[str, list[re.Pattern[str]]]] = [
    (tag, [re.compile(p, re.I) for p in pats]) for tag, pats in DOMAIN_RULES
]
_TECH_COMPILED: list[tuple[str, list[re.Pattern[str]]]] = [
    (slug, [re.compile(p, re.I) for p in pats]) for slug, pats in TECH_RULES
]

# If slug A is present, drop B (near-duplicate / generalization).
_TECH_SUPERSEDES: dict[str, frozenset[str]] = {
    "aurora": frozenset({"rds"}),
    "route53": frozenset({"dns"}),
}


def _score_domains(text: str) -> dict[str, int]:
    scores: dict[str, int] = {}
    for tag, patterns in _DOMAIN_COMPILED:
        n = sum(1 for rx in patterns if rx.search(text))
        if n:
            scores[tag] = n
    return scores


def _tech_hits(text: str) -> list[str]:
    found: list[str] = []
    for slug, patterns in _TECH_COMPILED:
        if any(rx.search(text) for rx in patterns):
            found.append(slug)
    return found


def infer_saa_c03_keywords(
    question: str,
    correct_answer: str,
    incorrect_answers: list[str],
) -> list[str]:
    primary = f"{question} {correct_answer}"
    full = " ".join([question, correct_answer, *incorrect_answers])

    dom_scores = _score_domains(primary)
    if not dom_scores:
        dom_scores = _score_domains(full)
    priority = {tag: i for i, (tag, _) in enumerate(DOMAIN_RULES)}
    ranked_domains = sorted(dom_scores.keys(), key=lambda t: (-dom_scores[t], priority[t]))
    domains = ranked_domains[:MAX_DOMAIN_TAGS]

    tech_pri = _tech_hits(primary)
    tech_full = _tech_hits(full)
    # Prefer primary only so incorrect answers do not add unrelated services (e.g. Route 53 + CloudFront distractor).
    merged_tech = tech_pri if tech_pri else tech_full
    tech_ordered: list[str] = []
    seen_t: set[str] = set()
    for slug in merged_tech:
        if slug in seen_t:
            continue
        seen_t.add(slug)
        tech_ordered.append(slug)

    # Drop superseded tech slugs
    drop: set[str] = set()
    for slug in tech_ordered:
        sup = _TECH_SUPERSEDES.get(slug)
        if sup:
            drop |= sup
    tech_ordered = [s for s in tech_ordered if s not in drop]

    if set(tech_ordered) & _DB_TECH_SLUGS and "databases" not in tech_ordered:
        tech_ordered.insert(0, "databases")

    tech = tech_ordered[:MAX_TECH_TAGS]

    out: list[str] = [EXAM_TAG]
    seen: set[str] = {EXAM_TAG}
    for k in domains + tech:
        if k not in seen:
            seen.add(k)
            out.append(k)
    return out
