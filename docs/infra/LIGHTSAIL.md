# AWS Lightsail

AWS Lightsail hosts the Quizymode API container in production.

## Current Role

- Production runtime for the ASP.NET Core API
- Environment-variable based application configuration
- Public API hosting behind the Cloudflare edge

## Operational Notes

- Keep runtime configuration in Lightsail environment variables rather than checked-in appsettings files.
- Cognito and Grafana settings referenced by the API should be supplied through environment variables in the service configuration.
- After deployment changes, verify API health, auth flows, and telemetry export from the running container.

## Related Docs

- [COGNITO_SETUP.md](./COGNITO_SETUP.md)
- [GRAFANA_CLOUD_SETUP.md](./GRAFANA_CLOUD_SETUP.md)
- [GITHUB_ACTIONS_DEPLOY.md](./GITHUB_ACTIONS_DEPLOY.md): automated deployment pipeline
