# S3 and CloudFront

Quizymode's React SPA is hosted on S3 behind CloudFront.

## Current Role

- S3 stores the built static web assets
- CloudFront serves those assets through the CDN
- CloudFront handles SPA route fallback behavior for browser deep links

## Operational Notes

- Deploy the web app with [scripts/deploy-to-s3.ps1](../../scripts/deploy-to-s3.ps1).
- Because the SPA uses `BrowserRouter`, configure CloudFront custom error handling so deep-link misses return `index.html`.
- Required fallback behavior:
  - `403 -> /index.html` with HTTP `200`
  - `404 -> /index.html` with HTTP `200`
- Without that fallback, direct reloads of non-root routes can return the S3 `AccessDenied` page instead of the app shell.
