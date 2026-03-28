Read `data/prompts/_master_prompt.md` first. Apply it fully. The rules below are category-specific additions for `tech`.

# Tech Seed Prompt

Work in this repo.

Read:

- `docs/quizymode_taxonomy.yaml`
- `data/prompts/_master_prompt.md`

Task:

Create or continue seed files for the `tech` category in:

- `data/bulk-seed/tech`

Filename format:

- `tech.<L1>.<L2>.json`

Examples:

- `tech.programming.python.json`
- `tech.web-dev.react.json`
- `tech.cloud.aws.json`

## Taxonomy and file rules

- Only use valid `L1/L2` pairs from `tech` in the taxonomy.
- Skip generic or mixed buckets unless explicitly requested.
- Skip `general` subtrees and `general-*` catch-all buckets unless explicitly requested.
- Prefer concrete technologies, concepts, or skills over broad overview buckets.
- Check whether the file already exists before writing it.
- Do not overwrite existing files unless explicitly asked.

## Audience

Write for a learner or practitioner who wants practical understanding, not empty jargon.

Questions should feel useful to someone building technical fluency, whether they code regularly or are trying to strengthen fundamentals.

## Question style for tech

Prefer:

1. concrete concepts
2. definitions with practical meaning
3. tradeoffs and comparisons
4. roles of components, tools, or protocols
5. stable syntax, behavior, or design principles

Avoid:

- stale buzzword questions
- trivia that depends on ephemeral product marketing
- unstable vendor claims unless versioned and verified
- syntax minutiae that only rewards memorization without understanding

## Sourcing for tech

Prefer official documentation, standards, language references, vendor docs, and strong educational or institutional sources.

Per file:

- minimum 2 source domains
- prefer 3+ domains

Good combinations:

- official docs + standards body + respected technical reference
- language docs + framework docs + primary vendor docs

## Writing rules

- Use simple technical English.
- Keep jargon only where needed.
- Make explanations clarify the concept directly.
- Prefer durable concepts over rapidly changing product news.

## Output shape

Use this exact item shape:

```json
[
  {
    "category": "tech",
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

