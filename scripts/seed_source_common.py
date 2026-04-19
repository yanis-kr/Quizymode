from __future__ import annotations

import csv
import json
import subprocess
import re
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ITEMS_ROOT = ROOT / "data" / "seed-source" / "items"
SOURCE_COLLECTIONS_ROOT = ROOT / "data" / "seed-source" / "collections" / "public"
REGISTRY_ROOT = ROOT / "data" / "seed-source" / "_registry"
DEV_SELECTION_PATH = ROOT / "data" / "seed-dev" / "selection.json"
SEED_DEV_ITEMS_ROOT = ROOT / "data" / "seed-dev" / "items"
SEED_DEV_COLLECTIONS_ROOT = ROOT / "data" / "seed-dev" / "collections"
TAXONOMY_YAML_PATH = ROOT / "docs" / "quizymode_taxonomy.yaml"
TAXONOMY_SEED_SQL_PATH = ROOT / "docs" / "quizymode_taxonomy_seed.sql"
SITEMAP_PATH = ROOT / "src" / "Quizymode.Web" / "public" / "sitemap.xml"
SITEMAP_BASE_URL = "https://www.quizymode.com"

# Static app pages: (path, lastmod, changefreq, priority)
_STATIC_PAGES: list[tuple[str, str, str, str]] = [
    ("/",           "2026-04-09", "weekly",  "1.0"),
    ("/categories", "2026-04-12", "weekly",  "0.9"),
    ("/collections","2026-04-12", "weekly",  "0.8"),
    ("/about",      "2026-04-12", "monthly", "0.7"),
    ("/ideas",      "2026-04-09", "weekly",  "0.8"),
    ("/roadmap",    "2026-01-20", "monthly", "0.6"),
    ("/feedback",   "2026-03-30", "monthly", "0.6"),
    ("/privacy",    "2026-04-03", "yearly",  "0.3"),
    ("/terms",      "2026-04-03", "yearly",  "0.3"),
]


@dataclass(frozen=True)
class Scope:
    category: str
    navigation_keyword1: str
    navigation_keyword2: str
    shard: str | None = None


@dataclass
class SourceItem:
    item_id: str
    category: str
    navigation_keyword1: str
    navigation_keyword2: str
    question: str
    correct_answer: str
    incorrect_answers: list[str]
    explanation: str | None
    keywords: list[str] | None
    source: str | None
    path: Path
    index: int


@dataclass
class PublicCollection:
    collection_id: str
    name: str
    description: str | None
    item_ids: list[str]
    path: Path


@dataclass(frozen=True)
class TaxonomyScope:
    category: str
    navigation_keyword1: str
    navigation_keyword2: str


def parse_scope_from_path(path: Path) -> Scope:
    parts = path.stem.split(".")
    if len(parts) < 3:
        raise ValueError(f"Unsupported seed filename format: {path}")

    shard: str | None = None
    if len(parts) == 4 and parts[3].isdigit():
        shard = parts[3]
        parts = parts[:3]
    elif len(parts) != 3:
        raise ValueError(f"Unsupported seed filename format: {path}")

    nav2 = re.sub(r"-p\d+$", "", parts[2])
    return Scope(parts[0], parts[1], nav2, shard)


def normalize_question(text: str) -> str:
    return " ".join(text.lower().split())


def is_guid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


def question_prefix(text: str, limit: int = 50) -> str:
    collapsed = " ".join(text.split())
    return collapsed[:limit]


def canonicalize_item_payload(item: SourceItem) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "itemId": item.item_id,
        "category": item.category,
        "navigationKeyword1": item.navigation_keyword1,
        "navigationKeyword2": item.navigation_keyword2,
        "question": item.question,
        "correctAnswer": item.correct_answer,
        "incorrectAnswers": item.incorrect_answers,
    }
    if item.explanation:
        payload["explanation"] = item.explanation
    if item.keywords:
        payload["keywords"] = item.keywords
    if item.source:
        payload["source"] = item.source
    return payload


def load_source_items(source_root: Path = SOURCE_ITEMS_ROOT) -> list[SourceItem]:
    items: list[SourceItem] = []
    for path in sorted(source_root.rglob("*.json")):
        scope = parse_scope_from_path(path)
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            raise ValueError(f"{path}: expected a JSON array.")

        for index, item in enumerate(raw):
            if not isinstance(item, dict):
                raise ValueError(f"{path} item {index}: expected an object.")

            item_id = str(item.get("itemId", "")).strip()
            if not item_id:
                raise ValueError(f"{path} item {index}: missing itemId.")
            if not is_guid(item_id):
                raise ValueError(f"{path} item {index}: itemId must be a GUID.")

            items.append(
                SourceItem(
                    item_id=item_id,
                    category=str(item.get("category", scope.category)).strip(),
                    navigation_keyword1=str(item.get("navigationKeyword1", scope.navigation_keyword1)).strip(),
                    navigation_keyword2=str(item.get("navigationKeyword2", scope.navigation_keyword2)).strip(),
                    question=str(item.get("question", "")).strip(),
                    correct_answer=str(item.get("correctAnswer", "")).strip(),
                    incorrect_answers=[str(value).strip() for value in item.get("incorrectAnswers", [])],
                    explanation=_optional_str(item.get("explanation")),
                    keywords=_optional_string_list(item.get("keywords")),
                    source=_optional_str(item.get("source")),
                    path=path,
                    index=index,
                )
            )

    return items


def load_public_collections(collections_root: Path = SOURCE_COLLECTIONS_ROOT) -> list[PublicCollection]:
    if not collections_root.exists():
        return []

    collections: list[PublicCollection] = []
    for path in sorted(collections_root.rglob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError(f"{path}: expected an object.")

        collections.append(
            PublicCollection(
                collection_id=str(raw.get("collectionId", "")).strip(),
                name=str(raw.get("name", "")).strip(),
                description=_optional_str(raw.get("description")),
                item_ids=[str(value).strip() for value in raw.get("itemIds", [])],
                path=path,
            )
        )

    return collections


def validate_source(
    items: list[SourceItem],
    collections: list[PublicCollection],
) -> list[str]:
    errors: list[str] = []
    seen_item_ids: dict[str, SourceItem] = {}
    seen_questions: dict[str, SourceItem] = {}
    taxonomy_scopes = load_taxonomy_scopes()

    for item in items:
        scope = parse_scope_from_path(item.path)
        if not is_guid(item.item_id):
            errors.append(f"{item.path} item {item.index}: itemId must be a GUID.")
        if item.category != scope.category:
            errors.append(f"{item.path} item {item.index}: category does not match filename scope.")
        if item.navigation_keyword1 != scope.navigation_keyword1:
            errors.append(f"{item.path} item {item.index}: navigationKeyword1 does not match filename scope.")
        if item.navigation_keyword2 != scope.navigation_keyword2:
            errors.append(f"{item.path} item {item.index}: navigationKeyword2 does not match filename scope.")
        taxonomy_scope = TaxonomyScope(
            category=item.category,
            navigation_keyword1=item.navigation_keyword1,
            navigation_keyword2=item.navigation_keyword2,
        )
        if taxonomy_scope not in taxonomy_scopes:
            errors.append(
                f"{item.path} item {item.index}: "
                f"'{item.category}' / '{item.navigation_keyword1}' / '{item.navigation_keyword2}' "
                f"is missing from docs/quizymode_taxonomy.yaml."
            )
        if not item.question:
            errors.append(f"{item.path} item {item.index}: question is required.")
        if not item.correct_answer:
            errors.append(f"{item.path} item {item.index}: correctAnswer is required.")

        existing_id = seen_item_ids.get(item.item_id)
        if existing_id is not None:
            errors.append(
                f"Duplicate itemId '{item.item_id}' found in {existing_id.path} and {item.path}."
            )
        else:
            seen_item_ids[item.item_id] = item

        normalized = normalize_question(item.question)
        existing_q = seen_questions.get(normalized)
        if existing_q is not None:
            errors.append(
                f"Duplicate question '{item.question}' found in {existing_q.path}#{existing_q.index} and {item.path}#{item.index}."
            )
        else:
            seen_questions[normalized] = item

    known_item_ids = set(seen_item_ids)
    for collection in collections:
        if not collection.collection_id:
            errors.append(f"{collection.path}: collectionId is required.")
        elif not is_guid(collection.collection_id):
            errors.append(f"{collection.path}: collectionId must be a GUID.")
        if not collection.name:
            errors.append(f"{collection.path}: name is required.")
        missing = [item_id for item_id in collection.item_ids if item_id not in known_item_ids]
        if missing:
            errors.append(f"{collection.path}: missing itemIds referenced: {', '.join(missing)}")

    return errors


def write_items_bundle(items: list[SourceItem], path: Path = REGISTRY_ROOT / "items-bundle.json") -> None:
    REGISTRY_ROOT.mkdir(parents=True, exist_ok=True)
    write_json(path, [canonicalize_item_payload(item) for item in items])


def _get_file_git_dates(paths: list[Path]) -> dict[Path, str | None]:
    """Return the last-commit ISO date for each path via a single git log call."""
    dates: dict[Path, str | None] = {p: None for p in paths}
    path_set = {p.relative_to(ROOT).as_posix(): p for p in paths}
    try:
        result = subprocess.run(
            ["git", "log", "--name-only", "--pretty=format:%cI", "--", "data/seed-source/items/"],
            capture_output=True, text=True, cwd=ROOT, check=False,
        )
    except FileNotFoundError:
        return dates
    current_date: str | None = None
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            current_date = None
            continue
        if len(line) >= 20 and line[4] == "-" and line[7] == "-" and "T" in line:
            current_date = line
        elif current_date and line in path_set:
            path = path_set[line]
            if dates[path] is None:
                dates[path] = current_date
    return dates


def write_source_file_index(
    items: list[SourceItem],
    path: Path = REGISTRY_ROOT / "source-file-index.json",
) -> None:
    from collections import defaultdict
    from datetime import datetime, timezone

    by_source: dict[Path, list[SourceItem]] = defaultdict(list)
    for item in items:
        by_source[item.path].append(item)

    source_paths = sorted(by_source.keys())
    git_dates = _get_file_git_dates(source_paths)

    files = []
    for source_path in source_paths:
        scope = parse_scope_from_path(source_path)
        files.append({
            "path": source_path.relative_to(ROOT).as_posix(),
            "category": scope.category,
            "nav1": scope.navigation_keyword1,
            "nav2": scope.navigation_keyword2,
            "itemCount": len(by_source[source_path]),
            "modifiedAt": git_dates.get(source_path),
        })

    index = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalItems": len(items),
        "files": files,
    }
    write_json(path, index)


def write_sitemap(
    items: list[SourceItem],
    path: Path = SITEMAP_PATH,
    base_url: str = SITEMAP_BASE_URL,
) -> None:
    from collections import defaultdict
    from datetime import datetime, timezone

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # One git log call for all source files
    source_paths = sorted({item.path for item in items})
    raw_dates = _get_file_git_dates(source_paths)

    # L2 dates: (category, nav1, nav2) -> max date across all contributing source files
    l2_dates: dict[tuple[str, str, str], str] = {}
    for source_path in source_paths:
        raw = raw_dates.get(source_path)
        date = raw[:10] if raw else today
        scope = parse_scope_from_path(source_path)
        key = (scope.category, scope.navigation_keyword1, scope.navigation_keyword2)
        if key not in l2_dates or date > l2_dates[key]:
            l2_dates[key] = date

    # L1 dates: max of all L2 dates under (category, nav1)
    l1_dates: dict[tuple[str, str], str] = defaultdict(str)
    for (cat, nav1, _), date in l2_dates.items():
        if date > l1_dates[(cat, nav1)]:
            l1_dates[(cat, nav1)] = date

    # Category dates: max of all L1 dates under category
    cat_dates: dict[str, str] = defaultdict(str)
    for (cat, _), date in l1_dates.items():
        if date > cat_dates[cat]:
            cat_dates[cat] = date

    def url_block(loc: str, lastmod: str, changefreq: str, priority: str) -> str:
        return (
            "  <url>\n"
            f"    <loc>{base_url}{loc}</loc>\n"
            f"    <lastmod>{lastmod}</lastmod>\n"
            f"    <changefreq>{changefreq}</changefreq>\n"
            f"    <priority>{priority}</priority>\n"
            "  </url>"
        )

    blocks: list[str] = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']

    for page_path, lastmod, changefreq, priority in _STATIC_PAGES:
        blocks.append(url_block(page_path, lastmod, changefreq, priority))

    for cat in sorted(cat_dates):
        blocks.append(url_block(f"/categories/{cat}", cat_dates[cat], "weekly", "0.8"))
        cat_l1s = sorted(nav1 for (c, nav1) in l1_dates if c == cat)
        for nav1 in cat_l1s:
            blocks.append(url_block(f"/categories/{cat}/{nav1}", l1_dates[(cat, nav1)], "weekly", "0.7"))
            cat_l2s = sorted(nav2 for (c, n1, nav2) in l2_dates if c == cat and n1 == nav1)
            for nav2 in cat_l2s:
                blocks.append(url_block(f"/categories/{cat}/{nav1}/{nav2}", l2_dates[(cat, nav1, nav2)], "weekly", "0.6"))

    blocks.append("</urlset>")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(blocks) + "\n", encoding="utf-8")


def write_item_registry(items: list[SourceItem], path: Path = REGISTRY_ROOT / "item-index.csv") -> None:
    REGISTRY_ROOT.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "ItemId",
                "Category",
                "NavigationKeyword1",
                "NavigationKeyword2",
                "QuestionPrefix50",
                "SourceFile",
            ]
        )
        for item in sorted(items, key=lambda entry: (entry.category, entry.navigation_keyword1, entry.navigation_keyword2, entry.question, entry.item_id)):
            writer.writerow(
                [
                    item.item_id,
                    item.category,
                    item.navigation_keyword1,
                    item.navigation_keyword2,
                    question_prefix(item.question),
                    item.path.relative_to(ROOT).as_posix(),
                ]
            )


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


def regenerate_taxonomy_seed_sql() -> None:
    subprocess.run(
        ["dotnet", "run", "--configuration", "Release", "--project", "tools/Quizymode.TaxonomySqlGen"],
        cwd=ROOT,
        check=True,
    )


def wipe_directory(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def next_sharded_file_path(category: str, nav1: str, nav2: str, existing_paths: set[Path], root: Path = SOURCE_ITEMS_ROOT) -> Path:
    base = root / category / f"{category}.{nav1}.{nav2}.json"
    if base not in existing_paths and not base.exists():
        return base

    counter = 2
    while True:
        candidate = root / category / f"{category}.{nav1}.{nav2}.{counter:02d}.json"
        if candidate not in existing_paths and not candidate.exists():
            return candidate
        counter += 1


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_string_list(value: Any) -> list[str] | None:
    if value is None:
        return None
    if not isinstance(value, list):
        raise ValueError("Expected a list of strings.")
    result = [str(item).strip() for item in value if str(item).strip()]
    return result or None


def load_taxonomy_scopes(taxonomy_path: Path = TAXONOMY_YAML_PATH) -> set[TaxonomyScope]:
    scopes: set[TaxonomyScope] = set()
    current_category: str | None = None
    current_l1: str | None = None
    in_root_keywords = False
    in_l1_keywords = False

    for raw_line in taxonomy_path.read_text(encoding="utf-8").splitlines():
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue

        indent = len(raw_line) - len(raw_line.lstrip(" "))
        stripped = raw_line.strip()

        if indent == 0 and stripped.endswith(":"):
            current_category = stripped[:-1].strip()
            current_l1 = None
            in_root_keywords = False
            in_l1_keywords = False
            continue

        if current_category is None:
            continue

        if indent == 2 and stripped == "keywords:":
            in_root_keywords = True
            in_l1_keywords = False
            current_l1 = None
            continue

        if indent == 4 and in_root_keywords and stripped.endswith(":"):
            current_l1 = stripped[:-1].strip()
            in_l1_keywords = False
            continue

        if indent == 6 and current_l1 is not None and stripped == "keywords:":
            in_l1_keywords = True
            continue

        if indent == 8 and in_l1_keywords and current_l1 is not None and ":" in stripped:
            l2_slug = stripped.split(":", 1)[0].strip()
            scopes.add(
                TaxonomyScope(
                    category=current_category,
                    navigation_keyword1=current_l1,
                    navigation_keyword2=l2_slug,
                )
            )

    return scopes
