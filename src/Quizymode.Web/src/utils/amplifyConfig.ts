import { Amplify } from "aws-amplify";
import { getCognitoDomain, isGoogleSignInEnabled } from "./googleSignInConfig";

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

if (!userPoolId || !clientId) {
  const errorMsg =
    "Cognito configuration missing. Please create a .env file in src/Quizymode.Web with:\n" +
    "VITE_COGNITO_USER_POOL_ID=your_user_pool_id\n" +
    "VITE_COGNITO_CLIENT_ID=your_client_id\n" +
    "VITE_COGNITO_REGION=us-east-1\n" +
    "VITE_API_URL=https://localhost:8080";
  console.error(errorMsg);
  throw new Error("Auth UserPool not configured. See console for details.");
}

export { isGoogleSignInEnabled };

export const configureAmplify = () => {
  const domain = getCognitoDomain();
  const origin = window.location.origin;

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: userPoolId!,
        userPoolClientId: clientId!,
        // OAuth (authorization code + PKCE, public client, no secret) is configured only when Google sign-in is on,
        // so with the flag off Amplify behaves exactly as before.
        ...(isGoogleSignInEnabled() && domain
          ? {
              loginWith: {
                oauth: {
                  domain,
                  scopes: ["openid", "email", "profile"],
                  redirectSignIn: [`${origin}/auth/callback`],
                  redirectSignOut: [`${origin}/`],
                  responseType: "code" as const,
                  providers: ["Google" as const],
                },
              },
            }
          : {}),
      },
    },
  });
};
