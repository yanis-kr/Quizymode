import { Amplify } from "aws-amplify";

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const region = import.meta.env.VITE_COGNITO_REGION || "us-east-1";

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

export const configureAmplify = () => {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: userPoolId!,
        userPoolClientId: clientId!,
        region: region,
      },
    },
  });
};
