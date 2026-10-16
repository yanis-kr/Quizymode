# #156 verification (local, Cognito simulated)

Same scripts as `issue-111-112/` (review-signup, probe-focus-overflow, probe-overflow2) re-run against branch `fix/156-signup-a11y`, plus `long-email.mjs` (60-character email on the confirmation step at 195x422, 390x844, 1280x900). Compare with `../issue-111-112/results.json` and `probe-results.json`.

- Errors: `role="alert"`, password field `aria-describedby="password-hint signup-error"`, `aria-invalid="true"`, focus on the field.
- Text inputs: 2px indigo box-shadow ring on focus (was none).
- Confirmation step at 195x422: scrollWidth 195 (was 208); 60-character email also fits at all three widths.
- Layout sweep: 0 horizontal overflows.
