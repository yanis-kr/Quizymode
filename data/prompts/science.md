Read `data/prompts/_master_prompt.md` first. Apply it fully. The rules below are category-specific additions for `science`.

# Science Seed Prompt

Work in this repo.

Read:

- `docs/quizymode_taxonomy.yaml`
- `data/prompts/_master_prompt.md`

Task:

Create or continue seed files for the `science` category in:

- `data/seed-source/items/science`

Filename format:

- `science.<L1>.<L2>.json`

Examples:

- `science.biology.genetics.json`
- `science.physics.energy.json`
- `science.math-general.formulas.json`

## Taxonomy and file rules

- Only use valid `L1/L2` pairs from `science` in the taxonomy.
- Skip generic or mixed buckets unless explicitly requested.
- Skip `general` subtrees and `general-*` catch-all buckets unless explicitly requested.
- Prefer concrete scientific or mathematical topics over broad review buckets.
- Check whether the file already exists before writing it.
- Do not overwrite existing files unless explicitly asked.

## Audience

Write for a student or curious learner who wants to understand the subject, not just memorize labels.

Questions should feel instructional, clear, and intellectually honest.

## Question style for science

Prefer:

1. concrete concepts
2. cause and effect
3. classification or structure
4. interpretation of common scientific ideas
5. formulas, quantities, or methods only when the meaning is clear

Avoid:

- flashy pop-science oversimplifications
- unexplained jargon
- unstable medical or scientific claims
- rote fact lists without conceptual value

## Sourcing for science

Prefer textbooks, educational institutions, official scientific agencies, recognized medical or scientific organizations, and strong reference sources.

Per file:

- minimum 2 source domains
- prefer 3+ domains

Use extra care on health, nursing, or medical-adjacent material. Keep to stable, well-supported facts.

## Writing rules

- Use simple language.
- Define technical ideas through the question and explanation, not through dense wording.
- Make explanations reinforce the concept directly.
- Keep numerical or formula-heavy items readable.

## Output shape

Use this exact item shape:

```json
[
  {
    "category": "science",
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

