Read `data/prompts/_master_prompt.md` first. Apply it fully. The rules below are category-specific additions for `history`.

# History Seed Prompt

Work in this repo.

Read:

- `docs/quizymode_taxonomy.yaml`
- `data/prompts/_master_prompt.md`

Task:

Create or continue seed files for the `history` category in:

- `data/bulk-seed/history`

Filename format:

- `history.<L1>.<L2>.json`

Examples:

- `history.ancient.rome.json`
- `history.us-history.revolution.json`
- `history.wars.world-war-2.json`

## Taxonomy and file rules

- Only use valid `L1/L2` pairs from `history` in the taxonomy.
- Skip generic or mixed buckets unless explicitly requested.
- Skip `general` subtrees and `general-*` catch-all buckets unless explicitly requested.
- Prefer specific eras, regions, or themes over broad overview buckets when a more concrete path exists.
- Check whether the file already exists before writing it.
- Do not overwrite existing files unless explicitly asked.

## Question style for history

## Audience

Write for a curious reader who wants to understand what happened, why it mattered, and how events connect.

Questions should reward historical understanding, not just slogan recall or isolated date memorization.

Meaningful history questions should test understanding, not slogan recall.

Prefer:

1. causes
2. consequences
3. chronology
4. significance
5. institutions, empires, movements, leaders, or turning points in context
6. stable facts tied to a dated event or period

Avoid:

- finish-the-quote items
- slogan-fragment recall
- overly narrow date memorization without context
- false drama or trick wording
- repetitive leader-name flashcards with no historical meaning

Good history questions usually connect a person, place, event, or movement to why it mattered.

## Sourcing for history

Use a mix of:

- museums
- archives
- libraries
- educational institutions
- official history or national archive pages
- reputable reference works for stable context

Per file:

- minimum 2 source domains
- prefer 3+ domains

Do not let one single encyclopedia dominate a full set if credible archival or institutional sources exist.

## Writing rules

- Keep stems concise.
- Use simple historical language.
- Explain the answer directly.
- Prefer vivid, concrete framing over textbook abstractions.

## Output shape

Use this exact item shape:

```json
[
  {
    "category": "history",
    "navigationKeyword1": "<L1>",
    "navigationKeyword2": "<L2>",
    "question": "Short question?",
    "correctAnswer": "Correct answer",
    "incorrectAnswers": ["Wrong 1", "Wrong 2", "Wrong 3"],
    "explanation": "Short explanation.",
    "keywords": ["reusable-tag-1", "reusable-tag-2"],
    "source": "https://..."
  }
]
```
