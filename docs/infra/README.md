# Infrastructure Notes

This folder holds environment and platform setup notes for the production and local cloud-adjacent pieces of Quizymode.

- [COGNITO_SETUP.md](./COGNITO_SETUP.md): Cognito auth and token setup
  - Google sign-in (AUTH-003) runbook: [COGNITO_SETUP.md#google-sign-in-auth-003](./COGNITO_SETUP.md#google-sign-in-auth-003); Pre sign-up Lambda source and tests: [`infra/cognito-presignup/`](../../infra/cognito-presignup/)
- [GRAFANA_CLOUD_SETUP.md](./GRAFANA_CLOUD_SETUP.md): Grafana Cloud telemetry setup
- [CLOUDFLARE.md](./CLOUDFLARE.md): DNS, TLS, proxy, and forwarded-header notes
- [S3_CLOUDFRONT.md](./S3_CLOUDFRONT.md): SPA hosting and deep-link fallback notes
- [LIGHTSAIL.md](./LIGHTSAIL.md): API container hosting notes
- [GITHUB_ACTIONS_DEPLOY.md](./GITHUB_ACTIONS_DEPLOY.md): CI/CD pipeline and AWS OIDC setup
- [SUPABASE.md](./SUPABASE.md): managed Postgres ownership and operational notes
