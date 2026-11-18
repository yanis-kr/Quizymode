# Secret rotation

`scripts/rotate/rotate.mjs` rotates production secrets into SSM Parameter Store (`/quizymode/prod/...`, see #782 to #784). It creates the new credential, stores it, waits for a redeploy, checks the new value and only then revokes the old one. It is a dry run unless you pass `--apply`.

**Run it only after the SSM cut-over (#784).** Until the API reads these parameters, a revoked old key would still be the one the container uses.

## Safe handling

- A new value goes from the provider straight into SSM through a private temp file (`aws ssm put-parameter --value file://...`). It is never an argument, never printed, never in the state file.
- The state file `.qm/rotation/<run-id>.json` holds only names, step status and the old credential's id.
- AWS errors are not shown (the CLI can echo values); the tool prints only its own messages.
- No screenshot and no page-text read at a page that shows a secret. Browser recipes read the value inside the script and hand it to the target.

## Running

```powershell
node scripts/rotate/rotate.mjs                              # dry run: prints the plan
node scripts/rotate/rotate.mjs --apply --only media-s3-key  # AWS-only secrets need no browser
```

Browser secrets need a dedicated Chrome, because Chrome 136+ ignores the debug port on the default profile:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\qm-rotate-chrome"
```

Sign in to the provider pages in that window, then run with `--apply` (`--cdp` changes the address).

Order: all no-downtime secrets together, the database last and alone (about 5 minutes of Supabase blip). After storing a group the tool needs the API redeployed: pass `--redeploy-cmd "<command>"`, or let it stop, redeploy yourself, and run again with the same `--run-id` and `--deployed`. A failed check stops the run with nothing revoked.

## Secrets

| Name | Method | Downtime | Parameter(s) | Check | Manual fallback |
|---|---|---|---|---|---|
| media-s3-key | aws-iam-key | none | `Media/S3/AccessKeyId`, `Media/S3/SecretAccessKey` | `sts get-caller-identity` with the new key | IAM > user `quizymode-api-media` > Security credentials > create key, store, delete old |
| gemini | browser | none | `Gemini/ApiKey` | recipe | provider console: create key, store, delete old |
| groq | browser | none | `Groq/ApiKey` | recipe | same |
| cerebras | browser | none | `Cerebras/ApiKey` | recipe | same |
| openrouter | browser | none | `OpenRouter/ApiKey` | recipe | same |
| openai | browser | none | `OpenAI/ApiKey` | recipe | same |
| grafana-cloud | browser | none | `GrafanaCloud/ApiKey` | recipe | Grafana Cloud portal > access policies > new token, store, delete old |
| github-seed-sync | browser | none | `GitHubSeedSync/Token` | recipe | GitHub > Settings > Developer settings > new token, store, delete old |
| supabase-db | browser | db-blip | `ConnectionStrings/PostgreSQL` | recipe | Supabase > Database settings > reset password (use the generate button), rebuild the connection string, store |

Store a manual value with `aws ssm put-parameter --type SecureString --overwrite --value file://<private file>`, never with the value on the command line.

## Browser recipes

A recipe is `scripts/rotate/recipes/<provider>.mjs` exporting `create(page, entry)` (returns `{ values: { secret }, oldRef }`), `check(values, entry)` and `revoke(page, oldRef, entry)`. A recipe must not log, screenshot or return page text. Provider recipes are added one at a time, walked through once with the owner signed in; until a recipe exists the tool stops with "no recipe" for that secret and nothing changes. Record the date a recipe was last walked through at its top.

Not covered yet: SES SMTP credential and the CloudFront signing key pair (add inventory entries when their SSM parameters exist).
