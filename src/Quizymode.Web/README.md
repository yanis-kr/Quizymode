# Quizymode Web

Use the root [README](../../README.md) as the canonical entry point for this repo.

This file only keeps frontend-local commands and environment notes:

```bash
cd src/Quizymode.Web
npm install
npm run dev
```

Expected local environment:

```env
VITE_API_URL=https://localhost:8080
VITE_COGNITO_USER_POOL_ID=your_user_pool_id
VITE_COGNITO_CLIENT_ID=your_client_id
VITE_COGNITO_REGION=us-east-1
```

The frontend expects the API to be running via Aspire AppHost unless `VITE_API_URL` points elsewhere.
