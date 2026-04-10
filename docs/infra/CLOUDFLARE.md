# Cloudflare

Cloudflare is the public edge for Quizymode.

## Current Role

- DNS for the public application and API hostnames
- TLS termination and proxying at the edge
- Forwarded headers passed through so the API can understand original client/proxy information

## Operational Notes

- Keep the API configured to trust forwarded headers in proxy scenarios.
- If public hostnames, certificates, or proxy behavior change, verify both the SPA and API still resolve correctly through Cloudflare.
- Treat Cloudflare as the edge layer only; static web hosting remains on S3 + CloudFront and the API runtime remains on AWS Lightsail.
- The ideas submission flow at `POST /ideas` depends on Cloudflare Turnstile in production. Keep the site key and secret configured for the deployed SPA/API pair.
- Apply an edge rate-limit rule for `POST /ideas` keyed by client IP in addition to the API's per-user limits so obvious bot bursts are throttled before they reach the app.
