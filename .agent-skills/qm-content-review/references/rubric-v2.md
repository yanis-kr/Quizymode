# Content Review Rubric 2

Change from rubric 1: the L2 and L3 passage is chosen by overlap with the question and every option (rubric 1 used the question and the stored key only). Rubric 1 calibration reached 78.1% recall with 78 of the 84 misses being evidence gaps, because a wrong key steers the passage toward the wrong answer. The verdict definitions below are unchanged.

## L1 blind answer

Choose the single best answer from the question and options without access to the stored key or explanation. Report whether more than one option is defensible and rate difficulty as easy, medium, or hard. Agreement is weak evidence; disagreement or ambiguity escalates to L2.

## L2 source-grounded review

Compare the stored key and explanation with the supplied eligible passage. Return one verdict: `source-verified`, `key-mismatch`, `ambiguous`, `content-fix`, or `evidence-gap`. A `source-verified` verdict and every change finding require a verbatim quote from the passage. Do not extrapolate beyond the passage. For exam items, the passage must come from a T1 vendor or standards-body source. Preserve the item as unverified when evidence is unavailable.

## L3 independent adjudication

Reassess a proposed exam answer or distractor change using a fresh context and a second eligible passage. Receive structured findings but no prior reviewer rationale. Return `supports-change`, `rejects-change`, `weak`, or `evidence-gap`. A supported change must have a verbatim quote from the second passage. Otherwise withhold the change.

## Calibration classification

- Historical wrong key: caught only when L2 produces a quote-backed finding that the stored answer is wrong or the item needs a fix.
- Known-good: false flag only when the final L2 workflow concludes the item needs an answer or content change. An L1 mismatch alone is not a false flag.
- Seeded wrong key: report catch rate separately from historical cases.
- Evidence gap: report separately; it is neither a verified finding nor a pass.

Changing these definitions requires a rubric version increment and a full calibration rerun before the pilot.
