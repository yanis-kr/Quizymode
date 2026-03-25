Work in this repo.

Read:

docs/quizymode_taxonomy.yaml
Task: For category History, create a folder:

data/bulk-seed/History
Then, in a cycle, create JSON seed files for each valid L1/L2 pair under History using this filename format:

History.<L1>.<L2>.json
Examples:

History.world.europe.json
History.us.states.json
History.physical.rivers.json
Rules:

Only use valid L1/L2 pairs from docs/quizymode_taxonomy.yaml under the History category.
Do not generate files for generic paths such as general, mixed, basics, or similar catch-all buckets unless explicitly requested.
Avoid L1=general (skip the entire History → general subtree).
Avoid L2=general.
Avoid L2=mixed.
Avoid L2 keys that are explicitly generic buckets in the taxonomy (e.g. general-world, general-countries, general-capitals, and other general-* navigation keywords under History).
Prefer concrete regions, themes, and skills (e.g. world.europe, climate.biomes, maps.scale) over broad overview buckets when a specific taxonomy path exists.
Create 10–15 items per file.
Prefer short questions over long questions.
Questions must be credible, factual, and clearly answerable.
Do not invent facts, boundaries, capitals, statistics, or “trick” History claims.
If a fact may have changed (names, capitals, borders, country status), verify it first.
Use reusable keywords that can apply across multiple questions in the same set.
Avoid one-off novelty tags.

Distractors must be plausible but clearly incorrect.
Explanations should be short and specific.
Where possible, provide a source URL pointing to the exact documentation or authoritative page the question is based on.
Prefer official government geographic agencies, UN or treaty texts, and established reference publishers; use reputable atlases or gazetteers when that is the best primary source for a fact.
If you cannot verify a question from a credible source, do not include it.
Keep wording concise.
Avoid trick questions.
Avoid duplicates and near-duplicates.
Avoid negative phrasing unless necessary.
Use lowercase hyphenated keywords.
Reuse a small stable keyword set per file when reasonable.
Do not use generic navigation buckets when a specific taxonomy path exists.
If an item has no solid source URL, omit that item rather than guessing.
Each JSON file must contain a raw JSON array only. Each item must use this exact shape:

[
  {
    "category": "History",
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
Execution loop:

Inspect taxonomy under History.
Pick the next missing L1/L2 pair in data/bulk-seed/History.
Skip any pair where L1 is general, or where L2 is general, mixed, or a general-* catch-all per the rules above.
Generate 10–15 verified items for that pair.
Save them to data/bulk-seed/History/History.<L1>.<L2>.json.
Repeat until all specific History L1/L2 pairs are covered.
Before writing each file:

Check whether the file already exists.
If it exists, do not overwrite it unless explicitly asked.
Context management rules:

Keep each run small: generate and save only 1 file per cycle unless explicitly told otherwise.
*Process L2=world the last, and when it names a whole-planet catch-all (e.g. capitals, flags) if a regional sibling exists , skip the question
*Proceed with the next files without asking, as long as context window is not overflowing.

Do not rely on chat memory for project state; use the filesystem as the source of truth.
Before starting work, inspect data/bulk-seed/History to see which files already exist.
After finishing a file, append a short handoff note to data/bulk-seed/History/_progress.md with:
file created
L1/L2 pair
item count
main source domains used
next suggested missing pair
If the conversation becomes too long, prior instructions become unclear, or reliable continuity is at risk, stop after the current file and tell the user to start a new chat.
In that case, provide a short restart prompt telling the next chat to read docs/quizymode_taxonomy.yaml and data/bulk-seed/History/_progress.md before continuing.
When finished with a cycle:

Print the file created.
Print any skipped pair and why.
Print the next recommended pair.

Continue History bulk-seed: read _progress.md and data/bulk-seed/History/*.json, then create the next 5 missing History.<L1>.<L2>.json files, update _progress.md after each, do not ask between files, stop only if context is tight or a fact can’t be verified.

Favor vivid, scenario-based questions; avoid bare ‘what is / define / which term’ unless the category is explicitly definitional.

at the end give me status - how many .json files created vs how many more still to go through

=======
Do not create trivia questions that depend on finishing a slogan, quote, catchphrase, or famous wording fragment unless the exact wording itself is the learning objective.

Prefer questions that test one of:
1. a concrete fact
2. a cause/effect relationship
3. a definition
4. a comparison
5. a historically meaningful outcome

Bad question patterns to avoid:
- “X said Y to make the world safe for what?”
- “Finish this quote...”
- “What famous phrase did ... use?”
- questions where the correct answer is obvious because distractors are absurd
- explanations that discuss related facts but do not explain why the correct answer is correct

Generate only questions that:
- can be understood without knowing a quote
- have plausible distractors from the same domain
- have explanations that directly explain the answer
- test meaningful knowledge, not word recall

Avoid this style:
Bad: "Woodrow Wilson asked Congress for a declaration of war against Germany in 1917 to make the world safe for what?"
Why bad: It tests recall of a slogan fragment rather than meaningful historical understanding.

Rewrite such items into questions like:
- "What reason did Woodrow Wilson publicly give for asking Congress to declare war on Germany in 1917?"
- "Which event most directly pushed the United States toward entering World War I in 1917?"
- "What was Woodrow Wilson’s main international goal after World War I?"

Question quality rules:
- Test meaningful knowledge, not catchy wording.
- Do not ask the user to complete slogans, quotes, mottos, or famous phrases unless exact wording is the topic.
- Prefer questions about causes, outcomes, significance, definitions, comparisons, chronology, and major actions.
- Distractors must be plausible and in the same category as the correct answer.
- Explanations must directly explain why the correct answer is right and why the question matters.
- Reject shallow “gotcha” trivia and vague wording.
- If a question can be answered only by remembering a phrase fragment, rewrite it.

