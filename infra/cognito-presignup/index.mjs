import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { handlePreSignUp } from "./lib/presignup.mjs";

// The Node.js 22 Lambda runtime provides AWS SDK v3, so it is only a devDependency here.
const client = new CognitoIdentityProviderClient({});

export const handler = (event) => handlePreSignUp(event, client);
