# Prompt Catalog

Category prompts live in this folder.

Read `data/prompts/_master_prompt.md` first, then the category-specific prompt:

- `data/prompts/business.md`
- `data/prompts/civics.md`
- `data/prompts/exams.md`
- `data/prompts/geography.md`
- `data/prompts/history.md`
- `data/prompts/humanities.md`
- `data/prompts/languages.md`
- `data/prompts/nature.md`
- `data/prompts/science.md`
- `data/prompts/sports.md`
- `data/prompts/tech.md`
- `data/prompts/trivia.md`

Use the category prompt that matches the target seed folder.

## Utility Prompt: Add Missing `seedId`

You will update a JSON array of quiz items.

Task:

- Add a new field `seedId` to every item that does not already have one.
- Use a newly generated UUID v4 string for each missing `seedId`.
- If an item already has `seedId`, keep it unchanged.
- Preserve every other field exactly as-is.
- Do not rewrite question text, answers, explanation, keywords, ordering, punctuation, or whitespace inside string values.
- Do not add or remove items.
- Return valid JSON only.
- Return the full updated JSON array, with no markdown fences and no commentary.

Important:

- Every `seedId` in the output must be unique within the file.
- `seedId` must be a plain JSON string.
