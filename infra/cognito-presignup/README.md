# Cognito Pre sign-up trigger (AUTH-003, #118)

Pool-wide Cognito Pre sign-up Lambda (Node.js 22) that makes "Continue with Google" safe:

- `PreSignUp_ExternalProvider` (user name `Google_<sub>`)
  - Google email not verified: throws `QM_GOOGLE_EMAIL_UNVERIFIED`; nothing is created or linked.
  - A CONFIRMED password account with a verified email exists: links the Google identity to it with
    `AdminLinkProviderForUser`, then throws `QM_ACCOUNT_LINKED`. The SPA retries sign-in once and Cognito signs the user in
    as the existing account (same `sub`, same `Users` row, same admin group).
  - An UNCONFIRMED password account exists: it is deleted (it never proved ownership of the email) and Cognito creates the
    Google user.
  - Any other state (FORCE_CHANGE_PASSWORD, RESET_REQUIRED, confirmed but unverified): throws `QM_NATIVE_ACCOUNT_STATE`.
  - No password account: pass through; Cognito creates the Google user.
- `PreSignUp_SignUp`: if a Google-only account already uses the email, throws `QM_USE_GOOGLE`; otherwise pass through.
- Everything else passes through. The trigger never sets `autoConfirmUser` or `autoVerifyEmail`, never logs emails or
  tokens, and fails closed when a Cognito call fails.

## Sentinel contract

Cognito wraps the thrown message as `PreSignUp failed with error QM_ACCOUNT_LINKED.`; the SPA matches the sentinel as a whole
token. Values live in `lib/errors.mjs` and are mirrored in
`src/Quizymode.Web/src/features/auth/utils/googleAuthErrors.ts`. Change both together.

## Develop

```bash
npm ci
npm test          # node:test, no network, Cognito client is faked
npm run package   # dist/presignup.zip (index.mjs + lib/)
```

The Node 22 Lambda runtime provides AWS SDK v3, so `@aws-sdk/client-cognito-identity-provider` is a devDependency only.

## Deploy (manual, owner)

Follow the Google sign-in section of `docs/infra/COGNITO_SETUP.md`. The trigger must be attached before Google is added to any
app client. To ship a code change:

```bash
npm run package
aws lambda update-function-code --function-name <FUNCTION_NAME> --zip-file fileb://dist/presignup.zip
```

`iam-policy.json` is the least-privilege reference for the execution role (replace the placeholders).
