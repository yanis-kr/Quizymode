"""Source fetcher, source tiers and link report for the content-quality cache (#769).

Standard library only. Politeness rules: one request per URL per run, robots.txt honoured, a per-domain delay, a 429
raises that domain's delay for later URLs, and a failing or blocked fetch is recorded as unfetchable with no retry.
Bot detection is never worked around. Fetched text lives only in the git-ignored cache, never in git.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable, Iterable

from quality_lib import CACHE_ROOT, QUALITY_ROOT, cache_path

USER_AGENT = "QuizymodeContentQuality/1.0 (seed content review; no personal contact)"
SOURCE_TIERS_PATH = QUALITY_ROOT / "source_tiers.json"
PROFILES_PATH = QUALITY_ROOT / "profiles.json"
CACHE_TTL_DAYS = 90
BASE_DOMAIN_DELAY_SEC = 1.0
MAX_DOMAIN_DELAY_SEC = 60.0
TIMEOUT_SEC = 20
TIER_ORDER = ("T1", "T2", "T3", "T4", "T5")

Transport = Callable[[str], tuple[int, str]]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_tiers(path: Path = SOURCE_TIERS_PATH) -> dict[str, Any]:
    return load_json(path)


def load_profiles(path: Path = PROFILES_PATH) -> dict[str, Any]:
    return load_json(path)


def tier_for_url(url: str, config: dict[str, Any]) -> str:
    """Tier of the URL's domain, matched on the domain or any parent domain. Unknown domains get defaultTier."""
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    parts = host.split(".")
    for start in range(len(parts) - 1):
        candidate = ".".join(parts[start:])
        if candidate in config["domains"]:
            return config["domains"][candidate]
    return config["defaultTier"]


def is_bare_homepage(url: str) -> bool:
    path = urllib.parse.urlsplit(url).path
    return path in ("", "/")


def wikipedia_api_url(url: str) -> str | None:
    """https://en.wikipedia.org/wiki/Title -> the plain-text extract API for that title (with the revision id)."""
    parts = urllib.parse.urlsplit(url)
    if not (parts.hostname or "").endswith("wikipedia.org") or not parts.path.startswith("/wiki/"):
        return None
    title = urllib.parse.unquote(parts.path[len("/wiki/"):])
    query = urllib.parse.urlencode({
        "action": "query",
        "prop": "extracts|info",
        "explaintext": "1",
        "titles": title,
        "format": "json",
        "formatversion": "2",
    })
    return f"{parts.scheme}://{parts.hostname}/w/api.php?{query}"


class _TextExtractor(HTMLParser):
    SKIP = {"script", "style", "nav", "header", "footer", "aside", "noscript", "svg"}

    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.SKIP:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip_depth and data.strip():
            self.parts.append(data.strip())


def extract_text(body: str, content_type_hint: str = "html") -> tuple[str, str | None]:
    """Return (plain text, revision id). The Wikipedia API returns JSON; other pages return HTML."""
    if content_type_hint == "wikipedia":
        data = json.loads(body)
        pages = (data.get("query") or {}).get("pages") or []
        page = pages[0] if pages else {}
        revision = str(page.get("lastrevid")) if page.get("lastrevid") else None
        return str(page.get("extract") or ""), revision
    parser = _TextExtractor()
    parser.feed(body)
    return re.sub(r"\s+", " ", " ".join(parser.parts)).strip(), None


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def read_entry(url: str, cache_root: Path = CACHE_ROOT) -> dict[str, Any] | None:
    path = cache_path(url, cache_root)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def write_entry(url: str, entry: dict[str, Any], cache_root: Path = CACHE_ROOT) -> None:
    path = cache_path(url, cache_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(entry, sort_keys=True, ensure_ascii=False), encoding="utf-8")


def is_fresh(entry: dict[str, Any], now: datetime) -> bool:
    fetched = datetime.fromisoformat(entry["fetchedAt"])
    return now - fetched < timedelta(days=CACHE_TTL_DAYS)


def default_transport(url: str) -> tuple[int, str]:
    """One GET with the generic client name. HTTP errors return their status; network errors raise OSError."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/json"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SEC) as response:  # noqa: S310 - https source URLs only
            raw = response.read(2_000_000)
            charset = response.headers.get_content_charset() or "utf-8"
            return response.status, raw.decode(charset, errors="replace")
    except urllib.error.HTTPError as error:
        return error.code, ""


@dataclass
class _DomainState:
    delay: float = BASE_DOMAIN_DELAY_SEC
    last_request: float | None = None
    robots: urllib.robotparser.RobotFileParser | None = None
    robots_error: str | None = None


@dataclass
class FetchSummary:
    requested: int = 0
    skipped_cached: int = 0
    skipped_duplicate: int = 0
    ok: int = 0
    unfetchable: int = 0
    reasons: dict[str, int] = field(default_factory=dict)
    seconds: float = 0.0

    def count(self, reason: str) -> None:
        self.reasons[reason] = self.reasons.get(reason, 0) + 1

    def as_dict(self) -> dict[str, Any]:
        return {
            "requested": self.requested,
            "skippedCached": self.skipped_cached,
            "skippedDuplicate": self.skipped_duplicate,
            "ok": self.ok,
            "unfetchable": self.unfetchable,
            "reasons": dict(sorted(self.reasons.items())),
            "seconds": round(self.seconds, 1),
        }


def fetch_run(
    urls: Iterable[str],
    cache_root: Path = CACHE_ROOT,
    transport: Transport = default_transport,
    now: datetime | None = None,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
    base_delay: float = BASE_DOMAIN_DELAY_SEC,
) -> FetchSummary:
    """Fetch each URL once: cached and fresh URLs are skipped, failures are recorded as unfetchable (no retry)."""
    started = clock()
    summary = FetchSummary()
    now = now or datetime.now(timezone.utc)
    domains: dict[str, _DomainState] = {}
    seen: set[str] = set()
    for url in urls:
        if url in seen:
            summary.skipped_duplicate += 1
            continue
        seen.add(url)
        existing = read_entry(url, cache_root)
        if existing and is_fresh(existing, now):
            summary.skipped_cached += 1
            continue
        summary.requested += 1
        parts = urllib.parse.urlsplit(url)
        domain = parts.netloc.lower()
        state = domains.setdefault(domain, _DomainState(delay=base_delay))
        _wait_for_domain(state, sleep, clock)
        entry = _fetch_one(url, parts, state, transport, now, summary)
        state.last_request = clock()
        write_entry(url, entry, cache_root)
    summary.seconds = clock() - started
    return summary


def _wait_for_domain(state: _DomainState, sleep: Callable[[float], None], clock: Callable[[], float]) -> None:
    if state.last_request is None:
        return
    remaining = state.delay - (clock() - state.last_request)
    if remaining > 0:
        sleep(remaining)


def _robots_allows(url: str, parts: urllib.parse.SplitResult, state: _DomainState, transport: Transport) -> str | None:
    """None when allowed; otherwise the reason the URL must not be fetched."""
    if state.robots is None and state.robots_error is None:
        robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
        try:
            status, body = transport(robots_url)
        except OSError:
            state.robots_error = "robots-unavailable"
        else:
            if status == 404 or status == 410:
                state.robots = urllib.robotparser.RobotFileParser()
                state.robots.parse([])
            elif status == 200:
                parser = urllib.robotparser.RobotFileParser()
                parser.parse(body.splitlines())
                state.robots = parser
            else:
                state.robots_error = "robots-unavailable"
    if state.robots_error:
        return state.robots_error
    assert state.robots is not None
    return None if state.robots.can_fetch(USER_AGENT, url) else "robots-disallowed"


def _fetch_one(
    url: str,
    parts: urllib.parse.SplitResult,
    state: _DomainState,
    transport: Transport,
    now: datetime,
    summary: FetchSummary,
) -> dict[str, Any]:
    stamp = now.isoformat()
    blocked = _robots_allows(url, parts, state, transport)
    if blocked:
        summary.unfetchable += 1
        summary.count(blocked)
        return {"url": url, "status": "unfetchable", "httpStatus": None, "reason": blocked, "fetchedAt": stamp}
    api = wikipedia_api_url(url)
    target = api or url
    try:
        status, body = transport(target)
    except OSError as error:
        summary.unfetchable += 1
        reason = f"error:{type(error).__name__}"
        summary.count(reason)
        return {"url": url, "status": "unfetchable", "httpStatus": None, "reason": reason, "fetchedAt": stamp}
    if status == 429:
        state.delay = min(state.delay * 2, MAX_DOMAIN_DELAY_SEC)
        summary.unfetchable += 1
        summary.count("429")
        return {"url": url, "status": "unfetchable", "httpStatus": 429, "reason": "429", "fetchedAt": stamp}
    if status != 200:
        summary.unfetchable += 1
        summary.count(f"http-{status}")
        return {"url": url, "status": "unfetchable", "httpStatus": status, "reason": f"http-{status}", "fetchedAt": stamp}
    text, revision = extract_text(body, "wikipedia" if api else "html")
    if not text:
        summary.unfetchable += 1
        summary.count("no-text")
        return {"url": url, "status": "unfetchable", "httpStatus": status, "reason": "no-text", "fetchedAt": stamp}
    summary.ok += 1
    entry = {
        "url": url,
        "status": "ok",
        "httpStatus": status,
        "text": text,
        "textHash": text_hash(text),
        "fetchedAt": stamp,
    }
    if revision:
        entry["revisionId"] = revision
    return entry


def link_report(urls_by_item: dict[str, str], config: dict[str, Any], cache_root: Path = CACHE_ROOT) -> dict[str, Any]:
    """Counts by HTTP status, tier and domain, plus bare homepages and the share of sources that yielded a passage."""
    by_status: dict[str, int] = {}
    by_tier: dict[str, int] = {}
    by_domain: dict[str, int] = {}
    bare: list[str] = []
    fetched_ok = 0
    urls = sorted(set(urls_by_item.values()))
    for url in urls:
        entry = read_entry(url, cache_root)
        status_key = str(entry.get("httpStatus") if entry and entry.get("httpStatus") is not None else (entry or {}).get("reason", "not-fetched"))
        if entry and entry.get("status") == "ok":
            fetched_ok += 1
        tier = config["unfetchableTier"] if not entry or entry.get("status") != "ok" else tier_for_url(url, config)
        domain = (urllib.parse.urlsplit(url).hostname or "").lower()
        by_status[status_key] = by_status.get(status_key, 0) + 1
        by_tier[tier] = by_tier.get(tier, 0) + 1
        by_domain[domain] = by_domain.get(domain, 0) + 1
        if is_bare_homepage(url):
            bare.append(url)
    item_count = len(urls_by_item)
    items_with_passage = sum(1 for item_url in urls_by_item.values() if (read_entry(item_url, cache_root) or {}).get("status") == "ok")
    return {
        "urls": len(urls),
        "fetchedOk": fetched_ok,
        "byStatus": dict(sorted(by_status.items())),
        "byTier": {tier: by_tier.get(tier, 0) for tier in TIER_ORDER},
        "byDomain": dict(sorted(by_domain.items(), key=lambda kv: (-kv[1], kv[0]))),
        "bareHomepages": sorted(bare),
        "items": item_count,
        "itemsWithSourceText": items_with_passage,
        "shareWithSourceText": round(items_with_passage / item_count, 4) if item_count else 0.0,
    }
