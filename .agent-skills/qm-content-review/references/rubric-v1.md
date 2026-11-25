# Content Review Rubric 1

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
