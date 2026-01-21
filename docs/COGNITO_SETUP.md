# AWS Cognito Authentication Setup Guide

This document explains how to configure AWS Cognito authentication for the Quizymode API and how to obtain bearer tokens for API calls.

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

   - Ensure your SPA client (`63b38es9dto8m59337jguiqli3`) has the following settings:
     - Allowed OAuth flows: Authorization code grant
     - Allowed OAuth scopes: `email`, `openid`, `phone`
     - Allowed callback URLs: `https://d84l1y8p4kdic.cloudfront.net`
     - Allowed sign-out URLs: `https://d84l1y8p4kdic.cloudfront.net`

2. **User Pool Groups**:

   - Create a group in your Cognito User Pool with a name starting with "admin" (case-insensitive)
   - Examples: `Admin`, `admin`, `Administrators`, `admin-users`
   - Add users who should have admin access to this group
   - The application checks for any group name starting with "admin" (case-insensitive)

3. **Token Configuration**:
   - Ensure that the `cognito:groups` claim is included in ID tokens
   - This is typically enabled by default when groups are assigned to users

## How to Get Bearer Tokens

There are several ways to obtain a bearer token for API calls:

### Method 1: Using Cognito Hosted UI (Recommended for Testing)

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
   - **Callback URL**: `https://d84l1y8p4kdic.cloudfront.net` (or `https://oauth.pstmn.io/v1/callback` for Postman's callback)
   - **Auth URL**: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LiJbvT212/oauth2/authorize`
   - **Access Token URL**: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LiJbvT212/oauth2/token`
   - **Client ID**: `63b38es9dto8m59337jguiqli3`
   - **Client Secret**: (leave empty for public SPA client)
   - **Scope**: `email openid phone`
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
- `cognito_client_id`: `63b38es9dto8m59337jguiqli3`
- `cognito_redirect_uri`: `https://d84l1y8p4kdic.cloudfront.net`
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

- `POST /items/bulk` - Bulk create items
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
