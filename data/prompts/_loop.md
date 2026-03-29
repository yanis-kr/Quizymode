Work in this repo.

Variables:
- {category}=business
- {prompt}=data/prompts/business.md
- {folder}=data/bulk-seed/business
- {progress}=.local/seed-progress/business/_progress.md
- {state}=.local/seed-progress/business/_business_state.md

Read:
- data/prompts/_master_prompt.md
- data/prompts/_execution.md
- {prompt}
- docs/quizymode_taxonomy.yaml
- {progress}
- {state}

Then inspect:
- {folder}

Task:
Continue fulfilling missing eligible `business` seed files (strict rules: skip `general` subtree + skip `general-*` L2 + skip `basics/mixed/review`) until all eligible pairs are complete.
Each `business.<L1>.<L2>.json` must have high-quality items with unique `seedId`, and 2+ (prefer 3+) source domains per file.
After adding files, run `python scripts/regenerate_business_progress.py` to update {progress}. The `.local/seed-progress/` folder is git-ignored and is the continuity source between prompt runs.

Status: eligible business L1/L2 pairs are complete (see {progress}). Regenerate banks via `python scripts/generate_missing_business_seeds.py` only for the L1s embedded in that script (skips existing files).
