from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCAL_PROGRESS_ROOT = ROOT / ".local" / "seed-progress"


def category_progress_dir(category: str) -> Path:
    return LOCAL_PROGRESS_ROOT / category


def progress_file_path(category: str) -> Path:
    return category_progress_dir(category) / "_progress.md"


def state_file_path(category: str) -> Path:
    return category_progress_dir(category) / f"_{category}_state.md"


def ensure_category_progress_dir(category: str) -> Path:
    path = category_progress_dir(category)
    path.mkdir(parents=True, exist_ok=True)
    return path
