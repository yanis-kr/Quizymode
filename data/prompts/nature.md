Read `data/prompts/_master_prompt.md` first. Apply it fully. The rules below are category-specific additions for `nature`.

# Nature Seed Prompt

Work in this repo.

Read:

- `docs/quizymode_taxonomy.yaml`
- `data/prompts/_master_prompt.md`

Task:

Create or continue seed files for the `nature` category in:

- `data/bulk-seed/nature`

Filename format:

- `nature.<L1>.<L2>.json`

Examples:

- `nature.animals.birds.json`
- `nature.survival.water.json`
- `nature.ecosystems.forests.json`

## Taxonomy and file rules

- Only use valid `L1/L2` pairs from `nature` in the taxonomy.
- Skip generic or mixed buckets unless explicitly requested.
- Skip `general` subtrees and `general-*` catch-all buckets unless explicitly requested.
- Prefer concrete ecosystems, skills, organisms, or outdoor topics over broad overview buckets.
- Check whether the file already exists before writing it.
- Do not overwrite existing files unless explicitly asked.

## Audience

Write for a curious nature or outdoors learner who wants useful, memorable knowledge.

For survival and camping topics, the tone should stay practical and safety-aware without becoming alarmist.

## Question style for nature

Prefer:

1. wildlife, plant, or ecosystem facts with real meaning
2. outdoor skills and safety principles
3. recognition and classification
4. practical environmental understanding
5. natural phenomena explained simply

Avoid:

- sensational survival myths
- unsafe advice
- animal factoids that are weird but not meaningful
- unstable claims without strong sourcing

## Sourcing for nature

Use a mix of:

- national parks and official outdoor agencies
- museums, zoos, aquariums, and botanical institutions
- educational institutions
- reputable reference sources for stable background facts

Per file:

- minimum 2 source domains
- prefer 3+ domains

## Writing rules

- Keep language simple and concrete.
- For safety topics, prefer stable best practices.
- Make explanations short and useful.
- Keep the set interesting, not just precautionary.

## Output shape

Use this exact item shape:

```json
[
  {
    "category": "nature",
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

