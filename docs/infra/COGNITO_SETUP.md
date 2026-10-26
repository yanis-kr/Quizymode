# AWS Cognito Authentication Setup Guide

This document explains how to configure AWS Cognito authentication for the Quizymode API and how to obtain bearer tokens for API calls.

Important: the web app signs in with email and password through AWS Amplify user-pool APIs (SRP) and refreshes tokens the same way. **Continue with Google** (AUTH-003, #118) is the only OAuth path: it uses the Cognito hosted domain with the authorization-code + PKCE flow and is off until `VITE_GOOGLE_SIGNIN_ENABLED=true` is shipped. See [Google sign-in (AUTH-003)](#google-sign-in-auth-003) for the one-time console setup; every step in that section is performed by the owner in the Google Cloud, AWS and Cloudflare consoles. The other Hosted UI examples in this document are for manual testing and troubleshooting.

## Configuration Overview

The application is configured to use AWS Cognito User Pool for authentication and authorization. The following settings are used:

- **User Pool ID**: `us-east-1_LiJbvT212`
- **Authority**: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LiJbvT212`
- **SPA Client ID**: `63b38es9dto8m59337jguiqli3`
- **Admin Group**: Any group starting with "admin" (case-insensitive, e.g., "Admin", "admin", "Administrators")

## Configuration Methods

### For Local Development (Aspire.NET)

The application uses Aspire.NET for local development. Configure Cognito settings in the AppHost project using one of these methods:

#### Option 1: User Secrets (Recommended - Not in Source Control)

User secrets are stored locally and not committed to source control:

```bash
# Set Authority
dotnet user-secrets set "Authentication:Cognito:Authority" "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LiJbvT212" --project src/Quizymode.Api.AppHost

# Set Client ID
dotnet user-secrets set "Authentication:Cognito:ClientId" "63b38es9dto8m59337jguiqli3" --project src/Quizymode.Api.AppHost

# Set Audience (optional, defaults to ClientId)
dotnet user-secrets set "Authentication:Cognito:Audience" "63b38es9dto8m59337jguiqli3" --project src/Quizymode.Api.AppHost
```

#### Option 2: appsettings.Development.json

Create or edit `src/Quizymode.Api.AppHost/appsettings.Development.json`:

```json
{
  "Authentication": {
    "Cognito": {
      "Authority": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LiJbvT212",
      "ClientId": "63b38es9dto8m59337jguiqli3",
      "Audience": "63b38es9dto8m59337jguiqli3"
    }
  }
}
```

**Note**: `appsettings.Development.json` should be in `.gitignore` to avoid committing sensitive data. User secrets are preferred.

### For Production (LightSail Environment Variables)

Configure the following environment variables in your AWS LightSail container service:

### Required Environment Variables

Set these in your LightSail container service configuration:

```
APP_Authentication__Cognito__Authority=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LiJbvT212
APP_Authentication__Cognito__ClientId=63b38es9dto8m59337jguiqli3
APP_Authentication__Cognito__Audience=63b38es9dto8m59337jguiqli3
```

**Note**: The double underscore (`__`) in environment variable names is used to represent nested configuration keys. The `APP_` prefix is used by the application to load environment variables.

### How to Set Environment Variables in LightSail

1. Go to AWS LightSail Console
2. Navigate to your container service
3. Click on your service name
4. Go to the **Configuration** tab
5. Click **Edit** next to "Container service configuration"
6. Scroll down to **Environment variables**
7. Add each variable:

   - Key: `APP_Authentication__Cognito__Authority`
   - Value: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LiJbvT212`

   - Key: `APP_Authentication__Cognito__ClientId`
   - Value: `63b38es9dto8m59337jguiqli3`

   - Key: `APP_Authentication__Cognito__Audience`
   - Value: `63b38es9dto8m59337jguiqli3`

8. Save the configuration
9. Deploy a new version of your container service

## Cognito User Pool Configuration

### Required Settings in Cognito

1. **App Client Settings**:

   - The production SPA client (`63b38es9dto8m59337jguiqli3`) is a public client (no secret) with SRP and refresh-token flows. Until Google sign-in is set up it needs no OAuth settings. After the Google steps below it has:
     - Identity providers: `COGNITO` and `Google`
     - Allowed OAuth flows: Authorization code grant
     - Allowed OAuth scopes: `openid`, `email`, `profile`
     - Allowed callback URLs: `https://www.quizymode.com/auth/callback`
     - Allowed sign-out URLs: `https://www.quizymode.com/`
   - The old CloudFront and Postman callback URLs are removed from this client; manual testing uses the separate dev client (see step 7 below).

2. **User Pool Groups**:

   - Create a group in your Cognito User Pool with a name starting with "admin" (case-insensitive)
   - Examples: `Admin`, `admin`, `Administrators`, `admin-users`
   - Add users who should have admin access to this group
   - The application checks for any group name starting with "admin" (case-insensitive)

3. **Token Configuration**:
   - Ensure that the `cognito:groups` claim is included in ID tokens
   - This is typically enabled by default when groups are assigned to users

## Google sign-in (AUTH-003)

Design record: issue #118 (ADR comment "Google Sign-in (revised 2026-10-19)"). The SPA ships dark behind `VITE_GOOGLE_SIGNIN_ENABLED`; none of this is needed for the password flows. **Do the steps in order.** In particular the Pre sign-up Lambda (step 4) must be attached before Google is added to any app client (step 6 and 7), otherwise a Google user can be created next to an existing password account and has to be cleaned up by hand.

How it works: the SPA sends the browser to the Cognito hosted domain (`auth.quizymode.com`) with `identity_provider=Google`. On the first Google sign-in Cognito calls the Pre sign-up Lambda in `infra/cognito-presignup/`. For a verified Google email that matches a CONFIRMED, verified password account the Lambda links the Google identity to that account and aborts that one attempt with `QM_ACCOUNT_LINKED`; the SPA retries once and Cognito signs the user into the existing account (same `sub`, so the same `Users` row and groups). The API needs no change: it validates the ID token the same way for every provider (audience = app client id).

### 1. Google Cloud

1. Create (or reuse) a Google Cloud project for Quizymode.
2. OAuth consent screen: app name, logo, home page `https://www.quizymode.com`, privacy policy `https://www.quizymode.com/privacy`, authorized domain `quizymode.com`, scopes `openid`, `email`, `profile` only (non-sensitive, so no Google security review is needed).
3. Verify the domain `quizymode.com` in Google Search Console (DNS TXT record in Cloudflare).
4. Create a **Web application** OAuth client. Its only authorized redirect URI is `https://auth.quizymode.com/oauth2/idpresponse`. Keep the client id and secret for step 5.
5. Submit brand verification when the consent screen asks for it, and publish the app to Production (Testing mode limits sign-in to listed test users).

### 2. ACM certificate

Request a public certificate for `auth.quizymode.com` in **us-east-1** (Cognito custom domains require it there) with DNS validation. Add the validation CNAME in Cloudflare (DNS only, not proxied).

### 3. Cognito custom domain

1. User pool `us-east-1_LiJbvT212` > Branding > Domain > create the custom domain `auth.quizymode.com` with the ACM certificate (managed login v2).
2. Cognito requires the parent domain to resolve: confirm `quizymode.com` has an A record (apex). Check what the apex does today: it is expected to redirect to `https://www.quizymode.com`; if it does not, register the apex callback and sign-out URLs in steps 6 and 7 as well.
3. In Cloudflare add a CNAME `auth` pointing at the CloudFront alias Cognito shows for the domain. **DNS only (grey cloud)**; proxying breaks the certificate.
4. Keep the existing prefix domain `us-east-1lijbvt212.auth.us-east-1.amazoncognito.com` available for manual testing.
5. Confirm the SPA's deep-link fallback serves `/auth/callback`: `curl -I https://www.quizymode.com/auth/callback` must return `200` with HTML (CloudFront serves `index.html` for deep links, see `S3_CLOUDFRONT.md`).

### 4. Pre sign-up Lambda (must come before steps 6 and 7)

Before attaching it, list the pool's existing users and look for anything that is not `CONFIRMED` with `email_verified=true`. The Lambda links only CONFIRMED + verified accounts, deletes UNCONFIRMED ones when the same verified Google email signs in, and refuses every other state (`FORCE_CHANGE_PASSWORD`, `RESET_REQUIRED`, confirmed but unverified) with a generic error:

```bash
aws cognito-idp list-users --user-pool-id us-east-1_LiJbvT212 --region us-east-1 \
  --query "Users[].[Username,UserStatus,Attributes[?Name=='email_verified'].Value|[0]]" --output table
```

A CONFIRMED user whose `email_verified` is not `true` is refused on first Google use (generic error), so fix or accept that before attaching the trigger.

Also check that usernames are case-insensitive, because the Lambda looks the password account up with `AdminGetUser` using the email Google sends:

```bash
aws cognito-idp describe-user-pool --user-pool-id us-east-1_LiJbvT212 --region us-east-1 \
  --query "UserPool.UsernameConfiguration"
```

`CaseSensitive` must be `false`. If it is `true`, **or the value is null/absent (a legacy case-sensitive pool)**, stop and ask before continuing: a Google email with different casing would not find the existing account. Also confirm that email is a sign-in identifier:

```bash
aws cognito-idp describe-user-pool --user-pool-id us-east-1_LiJbvT212 --region us-east-1   --query "UserPool.UsernameAttributes"
```

The result must contain `email`, because the Lambda calls `AdminGetUser` with the email address as the user name.

Deploy:

1. `cd infra/cognito-presignup && npm ci && npm test && npm run package` produces `dist/presignup.zip` (`index.mjs` + `lib/`).
2. Create a Lambda function: runtime **Node.js 22**, handler `index.handler`, upload the zip.
3. Execution role: attach only the policy in `infra/cognito-presignup/iam-policy.json` (replace `<ACCOUNT_ID>` and `<FUNCTION_NAME>`): `cognito-idp:ListUsers`, `AdminGetUser`, `AdminLinkProviderForUser` and `AdminDeleteUser` on the pool ARN `arn:aws:cognito-idp:us-east-1:<ACCOUNT_ID>:userpool/us-east-1_LiJbvT212`, plus basic CloudWatch Logs.
4. Add a resource-based permission so Cognito can invoke it: principal `cognito-idp.amazonaws.com`, action `lambda:InvokeFunction`, source ARN = the user pool ARN.
5. User pool > Extensions > Lambda triggers > **Pre sign-up** > select the function.
6. **Smoke test immediately:** sign up a throwaway password account in the live app and confirm it still works. The trigger is pool-wide, so a bug blocks all sign-ups; if it does, detach the trigger (rollback section below).

Later code changes: `npm run package`, then `aws lambda update-function-code --function-name <FUNCTION_NAME> --zip-file fileb://dist/presignup.zip`. The deploy workflow does not touch the Lambda; CI only runs its tests.

### 5. Google identity provider in Cognito

User pool > Social and external providers > Add > Google:

- Client id and secret from step 1.
- Authorize scopes: `openid email profile`.
- Attribute mapping: `email` > `email`, `email_verified` > `email_verified`, `name` > `name`, `sub` > `username`.

Note: Cognito names federated users `Google_<sub>` (capital G). The Lambda splits the user name on the first underscore.

Mapped attributes are re-applied at every Google sign-in. For a linked account this means Google can overwrite the Cognito `name` and `email` attributes of the password account. The app is not affected by a changed name (`UserUpsertMiddleware` only sets `Users.Name` when it is empty or equal to the `sub`), and `Users.Email` follows the token as it always has. Residual risk: for non-Gmail Google accounts `email_verified=true` only means the address was verified with Google at some point; Google Workspace and Gmail addresses are the common case and carry the usual account-takeover caveats of email-based linking.

### 6. Production app client (`63b38es9dto8m59337jguiqli3`)

- Identity providers: `COGNITO` and `Google`.
- OAuth grant: authorization code; scopes `openid`, `email`, `profile`.
- Callback URL: `https://www.quizymode.com/auth/callback`. Sign-out URL: `https://www.quizymode.com/`.
- Remove the old CloudFront and Postman URLs (they move to the dev client, step 7).
- If the apex `quizymode.com` does not redirect to `www`, also add `https://quizymode.com/auth/callback` and `https://quizymode.com/`.
- Keep it a public client with no secret; do not enable the implicit grant.

### 7. Dev app client (local development and manual token testing)

Create a second app client in the same pool: public, no secret, auth flows `ALLOW_USER_SRP_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH`, identity providers `COGNITO` and `Google`, authorization code grant, scopes `openid email profile`, callback `http://localhost:7000/auth/callback` plus the Postman callback `https://oauth.pstmn.io/v1/callback`, sign-out `http://localhost:7000/`.

### 8. Local setup

In `src/Quizymode.Web/.env.local`:

```
VITE_COGNITO_CLIENT_ID=<dev client id>
VITE_COGNITO_DOMAIN=auth.quizymode.com
VITE_GOOGLE_SIGNIN_ENABLED=true
```

The API accepts one audience and the SPA sends the ID token (`aud` = the app client), so the local API must trust the dev client. Do not edit the checked-in `appsettings.Development.json`; use AppHost user secrets:

```bash
dotnet user-secrets set "Authentication:Cognito:ClientId" "<dev client id>" --project src/Quizymode.Api.AppHost
dotnet user-secrets set "Authentication:Cognito:Audience" "<dev client id>" --project src/Quizymode.Api.AppHost
```

### 9. Checks

After the first real Google sign-ins:

```bash
aws cognito-idp list-users --user-pool-id us-east-1_LiJbvT212 --region us-east-1 \
  --filter 'email = "someone@example.com"'
```

returns exactly one user per email (a linked account shows the identity under the password user, not a second user). In PostgreSQL this must return no rows:

```sql
SELECT lower("Email"), count(*) FROM "Users" GROUP BY 1 HAVING count(*) > 1;
```

### 10. Enabling in production

Ship a follow-up change that sets `VITE_GOOGLE_SIGNIN_ENABLED=true` and `VITE_COGNITO_DOMAIN=auth.quizymode.com` in `src/Quizymode.Web/.env.production`, after the local test on the dev client passes. Attach evidence to #118.

### 11. Rollback

1. Set `VITE_GOOGLE_SIGNIN_ENABLED` back to `false` (or remove it) and redeploy the SPA: the button disappears and the password flows are unaffected.
2. If sign-ups are failing, detach the Pre sign-up trigger in Cognito.
3. Optionally remove Google from the app clients' identity providers.

**Warning:** users who only ever signed in with Google have no password and cannot use password recovery. Once Google is removed they cannot sign in at all until a password flow is added; linked accounts keep working with their password.

### Apex domain note

`quizymode.com` (apex) did not resolve from the agent's network and returned 403 via 1.1.1.1 when checked on 2026-10-19. Confirm what it does (ideally a 301 to `https://www.quizymode.com`) before step 6 and register the apex callback URLs if it serves the app itself.

## How to Get Bearer Tokens

There are several ways to obtain a bearer token for API calls:

### Method 1: Using Cognito Hosted UI (Recommended for Testing)

The production client no longer allows the CloudFront or Postman callback URLs. Use the dev app client from the Google section (step 7) for manual token testing: replace the client id and `redirect_uri` below with the dev client id and `http://localhost:7000/auth/callback` (or the Postman callback). The examples are written against the old production values for reference only.

1. Navigate to your Cognito Hosted UI URL:

   ```
   https://us-east-1lijbvt212.auth.us-east-1.amazoncognito.com/login?client_id=63b38es9dto8m59337jguiqli3&response_type=code&scope=email+openid+phone&redirect_uri=https%3A%2F%2Fd84l1y8p4kdic.cloudfront.net
   ```

   **Note**: The domain format is `{user-pool-id-lowercase}.auth.{region}.amazoncognito.com`

   - User Pool ID: `us-east-1_LiJbvT212` → Domain prefix: `us-east-1lijbvt212` (lowercase, no underscores)

2. Sign in with your credentials

3. After successful authentication, you'll be redirected to your callback URL with an authorization code

4. Exchange the authorization code for tokens using the Cognito token endpoint:

   **Important**: Use the Cognito domain endpoint, NOT the cognito-idp endpoint directly.

   ```bash
   curl -X POST https://us-east-1lijbvt212.auth.us-east-1.amazoncognito.com/oauth2/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code" \
     -d "client_id=63b38es9dto8m59337jguiqli3" \
     -d "code={authorization_code}" \
     -d "redirect_uri=https://d84l1y8p4kdic.cloudfront.net"
   ```

   **Note**: Since this is a public client (no client secret), we don't send client authentication. The `redirect_uri` must match exactly what was used in the authorization request.

5. The response will contain:
   - `id_token`: Use this for API calls (contains user info and groups)
   - `access_token`: Use for calling AWS services
   - `refresh_token`: Use to get new tokens when they expire

### Method 2: Using AWS CLI

```bash
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id 63b38es9dto8m59337jguiqli3 \
  --auth-parameters USERNAME=your-username,PASSWORD=your-password \
  --region us-east-1
```

**Note**: This method requires the app client to have `USER_PASSWORD_AUTH` flow enabled.

### Method 3: Using Postman

Postman provides built-in OAuth 2.0 support for obtaining tokens. Here's how to set it up:

#### Step 1: Configure OAuth 2.0 in Postman

1. Open Postman and create a new request or collection
2. Go to the **Authorization** tab
3. Select **OAuth 2.0** as the authorization type
4. Configure the following settings:

   **Configuration Options:**

   - **Grant Type**: Authorization Code
   - **Callback URL**: `https://oauth.pstmn.io/v1/callback` (registered on the dev app client; the production client no longer allows it)
   - **Auth URL**: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LiJbvT212/oauth2/authorize`
   - **Access Token URL**: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LiJbvT212/oauth2/token`
   - **Client ID**: the dev app client id (not the production client)
   - **Client Secret**: (leave empty for public SPA client)
   - **Scope**: `openid email profile`
   - **State**: (optional, leave empty)
   - **Client Authentication**: Send as Basic Auth header (unchecked for public client)

5. Click **Get New Access Token**
6. Postman will open a browser window for you to sign in
7. After signing in, you'll be redirected back to Postman with the token
8. Click **Use Token** to apply it to your request

#### Step 2: Use the Token in Requests

Once you have the token:

1. The token will be automatically added to the **Authorization** header as `Bearer {token}`
2. You can also manually set it:
   - Go to the **Headers** tab
   - Add header: `Authorization` with value `Bearer {your_id_token}`

#### Step 3: Import HTTP File (Alternative)

You can also use the provided `get-cognito-token.http` file:

1. In Postman, click **Import**
2. Select the `get-cognito-token.http` file
3. Update the variables:
   - `@authorizationCode` - Get this from the browser after signing in
   - `@idToken` - Copy from the token exchange response
   - `@apiBaseUrl` - Your API base URL
4. Execute the requests in order

#### Postman Environment Variables (Recommended)

Create a Postman environment with these variables:

- `cognito_authority`: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LiJbvT212`
- `cognito_client_id`: the dev app client id
- `cognito_redirect_uri`: `https://oauth.pstmn.io/v1/callback`
- `cognito_token_endpoint`: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LiJbvT212/oauth2/token`
- `api_base_url`: Your API base URL
- `id_token`: (will be set after token exchange)

Then use them in your requests like: `{{id_token}}`

## Token Expiration and Refresh

- ID tokens typically expire after 1 hour
- Use the `refresh_token` to obtain new tokens without requiring the user to sign in again
- Refresh tokens can last for days or weeks depending on your Cognito configuration

### Refreshing Tokens

```bash
curl -X POST https://cognito-idp.us-east-1.amazonaws.com/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "client_id=63b38es9dto8m59337jguiqli3" \
  -d "refresh_token={your_refresh_token}"
```

## Admin Endpoints

Endpoints that require admin access (users in any group starting with "admin", case-insensitive):

- `POST /items/bulk` - Bulk create items (admin only; 401 anonymous, 403 non-admin)
- `PUT /items/{id}/visibility` - Set item visibility

These endpoints use the `RequireAuthorization("Admin")` policy, which checks for the `cognito:groups` claim containing any group name starting with "admin" (case-insensitive).

## Troubleshooting

### Token Validation Errors

1. **Invalid Audience**: Ensure the token's `aud` claim matches your client ID
2. **Invalid Issuer**: Verify the token's `iss` claim matches your authority URL
3. **Expired Token**: Check the token's `exp` claim and refresh if necessary
4. **Invalid Signature**: Ensure the JWKS endpoint is accessible and the token was signed by Cognito

### Admin Access Not Working

1. Verify the user is assigned to a group in Cognito with a name starting with "admin" (case-insensitive)
2. Ensure the `cognito:groups` claim is included in the ID token
3. Check that the group name starts with "admin" (e.g., "Admin", "admin", "Administrators" - all work)

### Environment Variables Not Loading

1. Verify the variable names use double underscores (`__`) for nested keys
2. Ensure the `APP_` prefix is included
3. Restart the container service after adding environment variables
4. Check container logs for configuration errors

## Security Best Practices

1. **Never expose tokens in client-side code or logs**
2. **Use HTTPS for all API calls** (already configured via Cloudflare)
3. **Implement token refresh logic** in your frontend application
4. **Store tokens securely** (use httpOnly cookies or secure storage)
5. **Validate tokens on the server** (already implemented)
6. **Use short-lived tokens** and refresh them regularly
7. **Implement proper CORS policies** (already configured)

## Additional Resources

- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [OAuth 2.0 / OpenID Connect](https://oauth.net/2/)
- [JWT.io](https://jwt.io/) - For decoding and inspecting JWT tokens
