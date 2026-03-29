from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCAL_PROGRESS_ROOT = ROOT / "generated" / "seed-progress"


def category_progress_dir(category: str) -> Path:
    return LOCAL_PROGRESS_ROOT / category


def category_progress_file(category: str, file_name: str) -> Path:
    return category_progress_dir(category) / file_name


def progress_file_path(category: str) -> Path:
    return category_progress_file(category, "_progress.md")


def state_file_path(category: str) -> Path:
    return category_progress_file(category, f"_{category}_state.md")


def ensure_category_progress_dir(category: str) -> Path:
    path = category_progress_dir(category)
    path.mkdir(parents=True, exist_ok=True)
    return path
