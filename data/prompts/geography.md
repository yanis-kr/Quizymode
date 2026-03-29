Read `data/prompts/_master_prompt.md` first. Apply it fully. The rules below are category-specific additions for `geography`.

# Geography Seed Prompt

Work in this repo.

Read:

- `docs/quizymode_taxonomy.yaml`
- `data/prompts/_master_prompt.md`

Task:

Create or continue seed files for the `geography` category in:

- `data/seed-source/items/geography`

Filename format:

- `geography.<L1>.<L2>.json`

Examples:

- `geography.world.europe.json`
- `geography.capitals.asia.json`
- `geography.physical.rivers.json`

## Taxonomy and file rules

- Only use valid `L1/L2` pairs from `geography` in the taxonomy.
- Skip generic or mixed buckets unless explicitly requested.
- Skip `general` subtrees and `general-*` catch-all buckets unless explicitly requested.
- Prefer concrete regional or thematic paths over broad overview buckets when a specific path exists.
- Check whether the file already exists before writing it.
- Do not overwrite existing files unless explicitly asked.

## Question style for geography

## Audience

Write for a curious learner who wants to understand places, regions, and map relationships.

The set should feel more like smart world knowledge than rote memorization. Favor understanding and recognition over flat list-drilling whenever possible.

Make geography questions feel like real map knowledge, world knowledge, and place understanding, not just memorized lists.

Prefer:

1. location relationships
2. region recognition
3. physical or human geography with meaning
4. capitals, borders, rivers, mountains, or climate facts that are worth knowing
5. map-skill questions when the taxonomy calls for them

Avoid:

- endless flat capital drills when a better angle exists
- obscure administrative trivia
- unstable population rankings unless year-anchored
- trick border questions with misleading edge cases

The best geography sets mix anchor facts and slightly more thoughtful items.

## Sourcing for geography

Use a mix of:

- official government or intergovernmental geography sources
- national statistical or geographic agencies
- official tourism or city pages when relevant
- reputable reference works for stable background facts

Per file:

- minimum 2 source domains
- prefer 3+ domains

Do not build a full file from only one encyclopedia or one government site if credible alternatives are available.

## Writing rules

- Keep questions short.
- Use simple place language.
- Avoid unnecessary coordinate or measurement detail unless the topic requires it.
- Make explanations directly reinforce the geography fact.

## Output shape

Use this exact item shape:

```json
[
  {
    "category": "geography",
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
