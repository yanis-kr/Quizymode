Follow the canonical agent guide in [../AGENTS.md](../AGENTS.md).

Repo-specific priorities:

- keep `README.md` canonical and concise
- keep `docs/openapi/quizymode-api.json` in sync with API changes
- prefer vertical-slice changes over cross-cutting sprawl
- do not assume PKCE auth flow; current SPA auth uses Amplify user-pool APIs
