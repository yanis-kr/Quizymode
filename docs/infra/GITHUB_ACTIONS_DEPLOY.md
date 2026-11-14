# GitHub Actions Deployment

CI (`ci.yml`) builds and tests every pull request and every push to `main`. On `main` it also pushes the Docker image to GHCR.
A separate deploy workflow (`deploy.yml`) then deploys the container to LightSail and the UI to S3/CloudFront.

## CI jobs

The jobs run in parallel. A new push to a pull request cancels the run for its previous commit; runs on `main` are never cancelled.

| Job | What it does |
|---|---|
| `frontend` | Web build, curated image and manifest checks, source map artifact, lint |
| `frontend-tests` | Vitest with coverage |
| `backend-tests` | Architecture tests, then all backend tests with coverage |
| `api-image` | Release build with the OpenAPI drift check, then the Docker image. On `main` it pushes `:<sha>` |
| `build-test-publish` | Required check. Fails unless the four jobs above passed, posts the coverage comment, and on `main` moves `:latest` to the pushed `:<sha>` |
| `automation-contract`, `ac-gate`, `cognito-presignup`, `e2e` | Independent checks |

Rules to keep when editing the workflow:

- Branch protection requires `build-test-publish`, `automation-contract` and `CodeQL` by name. `build-test-publish` runs with `if: always()` and checks each needed job's result, because GitHub counts a skipped required job as passed.
- A new build or test job must be added to the `needs` list of `build-test-publish`, or it will not block a merge.
- On `main` the image is pushed as `:<sha>` before the tests finish. That is safe because Deploy starts only when the whole CI run succeeded, and `:latest` moves only after every job passed. An image tag for a commit whose CI failed can exist in GHCR; it is never deployed by the pipeline.
- The image build uses no layer cache. Every change set bumps `Directory.Build.props`, which invalidates the restore layer, so the cache never hit while exporting it took about 3 minutes and filled the 10 GB Actions cache.

## How it works

1. **CI completes** on `main` → image pushed to `ghcr.io/yanis-kr/quizymode:<sha>`
2. **`deploy-container` job** — reads env vars from the currently active LightSail deployment, then creates a new deployment with the updated image. Waits up to 10 minutes for `ACTIVE` state.
3. **`build-ui` job** — runs at the same time as `deploy-container`: builds the frontend and uploads it as the `web-dist` artifact (source maps go to a separate artifact and are never deployed).
4. **`deploy-ui` job** — after both jobs above succeed, downloads `web-dist`, syncs it to S3 with per-type cache headers, then invalidates CloudFront. It waits for the container so the new UI never calls the previous API.
5. **`prod-verify` job** — signed-in checks on the deployed site (AC 7.10.5).

## AWS OIDC setup (one-time)

GitHub Actions authenticates to AWS via OIDC — no long-lived keys stored in secrets.

### 1. Create the Identity Provider

In **IAM → Identity providers → Add provider**:

| Field | Value |
|---|---|
| Provider type | OpenID Connect |
| Provider URL | `https://token.actions.githubusercontent.com` |
| Audience | `sts.amazonaws.com` |

Click **Get thumbprint**, then **Add provider**.

### 2. Create the IAM Role

In **IAM → Roles → Create role**:

| Field | Value |
|---|---|
| Trusted entity | Web identity |
| Identity provider | `token.actions.githubusercontent.com` |
| Audience | `sts.amazonaws.com` |
| GitHub organization | `yanis-kr` |
| GitHub repository | `Quizymode` |
| GitHub branch | `main` |

Name the role `github-actions-quizymode-deploy` and create it.

### 3. Attach inline permissions policy

Open the created role → **Permissions → Add permissions → Create inline policy** → JSON editor:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LightSailDeploy",
      "Effect": "Allow",
      "Action": [
        "lightsail:CreateContainerServiceDeployment",
        "lightsail:GetContainerServiceDeployments"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3Deploy",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::quizymode-web",
        "arn:aws:s3:::quizymode-web/*"
      ]
    },
    {
      "Sid": "CloudFrontInvalidate",
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "*"
    }
  ]
}
```

Name the policy `quizymode-deploy-policy`.

### 4. Add GitHub secret

In the repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | ARN of the role created above (e.g. `arn:aws:iam::123456789012:role/github-actions-quizymode-deploy`) |

## LightSail configuration preserved across deployments

The deploy workflow fetches env vars from the currently active deployment via `get-container-service-deployments`, so values configured in the LightSail console are preserved. Only the image tag changes.

Current container env vars (values stored in LightSail, not in GitHub):

- `APP_Authentication__Cognito__ClientId`
- `APP_Authentication__Cognito__Audience`
- `APP_Authentication__Cognito__Authority`
- `APP_ConnectionStrings__PostgreSQL`
- `APP_Gemini__ApiKey` / `APP_Groq__ApiKey` / `APP_Cerebras__ApiKey` / `APP_OpenRouter__ApiKey` / `APP_OpenAI__ApiKey` (study-guide LLM vendors, #464; a vendor without a key is skipped). `APP_DeepSeek__*` is no longer read and can be removed. Optional: `APP_{Vendor}__BaseUrl`, `APP_{Vendor}__MaxTokens` (Groq defaults to 4000).
- `APP_GrafanaCloud__ApiKey`
- `APP_GrafanaCloud__Enabled`
- `APP_GrafanaCloud__LokiInstanceId`
- `APP_GrafanaCloud__LokiEndpoint`
- `APP_GrafanaCloud__OtlpEndpoint`
- `APP_GrafanaCloud__OtlpInstanceId`
- `APP_Turnstile__Enabled` (`true` in prod) and `APP_Turnstile__SecretKey` (Cloudflare secret; the public site key is `VITE_TURNSTILE_SITE_KEY` in `src/Quizymode.Web/.env.production`)
- `ASPNETCORE_ENVIRONMENT`

## Related docs

- [LIGHTSAIL.md](./LIGHTSAIL.md)
- [S3_CLOUDFRONT.md](./S3_CLOUDFRONT.md)
