# Execution Template

Use this file as the reusable execution layer for any seed category.

Set variables once at the top of your request and then refer to them consistently.

## Variables

```md
Variables:
- {category}=science
- {prompt}=data/prompts/{category}.md
- {folder}=data/bulk-seed/{category}
- {progress}={folder}/_progress.md
- {state}={folder}/_{category}_state.md
```

Optional for narrower runs:

```md
- {l1}=movies-tv
```

## Recommended request shape

```md
Work in this repo.

Variables:
- {category}=trivia
- {prompt}=data/prompts/{category}.md
- {folder}=data/bulk-seed/{category}
- {progress}={folder}/_progress.md
- {state}={folder}/_{category}_state.md

Read:
- data/prompts/_master_prompt.md
- data/prompts/_execution.md
- {prompt}
- docs/quizymode_taxonomy.yaml

Then inspect:
- {folder}

Task:
Continue fulfilling `{category}` seed coverage until you hit the stopping rule in `data/prompts/_execution.md`.
```

## Execution policy

- Continue creating missing seed files until all eligible `L1/L2` pairs for `{category}` are covered.
- Use the filesystem as the source of truth, not chat memory.
- Create only missing eligible files for `{category}`.
- Do not overwrite existing files unless explicitly asked.
- Keep question quality high even if the run is long.
- Use the category prompt and master prompt as binding quality rules.
- Every generated item must include a non-empty `seedId`.
- Before finalizing any file, perform a deliberate review pass over the generated questions and regenerate weak items instead of leaving them in place.

## seedId rule

- New items must include a `seedId` at creation time.
- Generate a UUID v4 for each new item unless the workflow explicitly requires another stable scheme.
- Keep existing `seedId` values unchanged when revising existing items.
- Never leave a generated file without `seedId` fields.
- If you encounter older source files missing `seedId`, add them before relying on those files for downstream manifest generation or sync.

## Quality guardrail

Do not continue on low-confidence memory just to keep going.

If continuity, instruction recall, or source quality starts to slip, stop after the current file and hand off cleanly. Quality is more important than squeezing in more files.

Do not rely on guessed context-window percentages. Use visible continuity signals instead:

- the thread is getting long
- prior instructions may be falling out of focus
- the model is repeating itself
- source quality is dropping
- question quality is getting flatter or more obvious

## Filesystem-based continuity

Before each file, reread:

- `docs/quizymode_taxonomy.yaml`
- `{progress}` if it exists
- existing `{folder}/*.json`

Before writing each file, do one explicit post-draft review pass:

- read through the whole generated set critically
- identify weak, obvious, repetitive, awkward, or low-confidence items
- revise them
- if revision is not enough, regenerate and replace them
- write the file only after the set clears that review

After each file, update `{progress}` with a short handoff note including:

- file created
- `L1/L2` pair
- item count
- whether `seedId` fields were generated or already present
- source domains used
- recurring style decisions
- next suggested missing pair

After finishing an `L1` subtree, rewrite a compact state summary at `{state}` containing:

- completed `L2` files under that `L1`
- approved source domains
- wording or style rules learned
- weak patterns to avoid
- next missing `L1/L2` pair

This is the safe replacement for trying to "compress context" inside the chat. Store continuity on disk and reread it.

## Stop rule

Stop only:

- after all eligible `{category}` pairs are covered, or
- after the current file if continuity risk becomes high, or
- after the current file if you cannot verify facts to the required quality bar

Do not stop mid-file.

## Restart handoff

When stopping early, print a short restart prompt telling the next chat to read:

- `docs/quizymode_taxonomy.yaml`
- `{progress}`
- `{state}` if it exists
- `{prompt}`

Recommended restart prompt:

```md
Work in this repo.

Variables:
- {category}=trivia
- {prompt}=data/prompts/{category}.md
- {folder}=data/bulk-seed/{category}
- {progress}={folder}/_progress.md
- {state}={folder}/_{category}_state.md

Read:
- data/prompts/_master_prompt.md
- data/prompts/_execution.md
- {prompt}
- docs/quizymode_taxonomy.yaml
- {progress}
- {state}

Then inspect:
- {folder}

Continue fulfilling missing eligible `{category}` seed files from the filesystem state.
Do not overwrite existing files.
Stop only according to `data/prompts/_execution.md`.
```

## Optional narrower run

If you want to constrain a run to one subtree, add:

```md
- {l1}=movies-tv
```

Then state:

```md
Create only missing eligible `{category}` files where `L1={l1}`.
```

## End-of-run reporting

At the end of the run, report:

- how many `{category}` files were created in this run
- how many `{category}` files exist now
- how many eligible `{category}` `L1/L2` pairs exist in the taxonomy
- how many eligible `{category}` pairs remain
