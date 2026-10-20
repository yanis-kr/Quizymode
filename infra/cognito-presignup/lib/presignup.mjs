import {
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminLinkProviderForUserCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  ACCOUNT_LINKED,
  GOOGLE_EMAIL_UNVERIFIED,
  NATIVE_ACCOUNT_STATE,
  USE_GOOGLE,
} from "./errors.mjs";

const GOOGLE_PROVIDER = "Google";

function isTrue(value) {
  return String(value).toLowerCase() === "true";
}

function log(triggerSource, branch) {
  // Never log email addresses, subjects, or tokens.
  console.log(JSON.stringify({ triggerSource, branch }));
}

function getAttribute(user, name) {
  const attributes = user.UserAttributes ?? user.Attributes ?? [];
  return attributes.find((attribute) => attribute.Name === name)?.Value;
}

/** Federated users are named "<Provider>_<subject>"; split on the first underscore only. */
function parseFederatedUserName(userName) {
  const index = typeof userName === "string" ? userName.indexOf("_") : -1;
  if (index <= 0) {
    return null;
  }
  return { provider: userName.slice(0, index), subject: userName.slice(index + 1) };
}

async function findNativeUser(client, poolId, email) {
  try {
    // Username lookup follows the pool's UsernameConfiguration (case-insensitive when CaseSensitive=false).
    return await client.send(new AdminGetUserCommand({ UserPoolId: poolId, Username: email }));
  } catch (error) {
    if (error?.name === "UserNotFoundException") {
      return null;
    }
    throw error;
  }
}

async function hasGoogleOnlyUser(client, poolId, email) {
  const candidates = [...new Set([email.toLowerCase(), email])];
  for (const candidate of candidates) {
    if (candidate.includes('"') || candidate.includes("\\")) {
      // Cannot be embedded safely in a ListUsers filter, and is not a valid sign-up email anyway.
      continue;
    }
    const response = await client.send(
      new ListUsersCommand({
        UserPoolId: poolId,
        Filter: `email = "${candidate}"`,
        Limit: 10,
      }),
    );
    if ((response.Users ?? []).some((user) => user.UserStatus === "EXTERNAL_PROVIDER")) {
      return true;
    }
  }
  return false;
}

async function handleExternalProvider(event, client) {
  const trigger = event.triggerSource;
  const federated = parseFederatedUserName(event.userName);
  if (federated?.provider !== GOOGLE_PROVIDER) {
    log(trigger, "non-google-pass-through");
    return event;
  }

  const attributes = event.request?.userAttributes ?? {};
  const email = attributes.email;
  if (!email || !isTrue(attributes.email_verified)) {
    log(trigger, "email-unverified");
    throw new Error(GOOGLE_EMAIL_UNVERIFIED);
  }

  const poolId = event.userPoolId;
  const native = await findNativeUser(client, poolId, email);
  if (!native || native.UserStatus === "EXTERNAL_PROVIDER") {
    log(trigger, "create-google-user");
    return event;
  }

  if (native.UserStatus === "UNCONFIRMED") {
    // An unconfirmed password sign-up proves nothing about the email. Linking would hand the account to whoever
    // chose that password; leaving it would block the verified owner. Remove it and let the Google user be created.
    await client.send(new AdminDeleteUserCommand({ UserPoolId: poolId, Username: native.Username }));
    log(trigger, "deleted-unconfirmed-native");
    return event;
  }

  if (native.UserStatus === "CONFIRMED" && isTrue(getAttribute(native, "email_verified"))) {
    await client.send(
      new AdminLinkProviderForUserCommand({
        UserPoolId: poolId,
        DestinationUser: {
          ProviderName: "Cognito",
          ProviderAttributeValue: native.Username,
        },
        SourceUser: {
          ProviderName: federated.provider,
          ProviderAttributeName: "Cognito_Subject",
          ProviderAttributeValue: federated.subject,
        },
      }),
    );
    log(trigger, "linked");
    throw new Error(ACCOUNT_LINKED);
  }

  log(trigger, "native-state-rejected");
  throw new Error(NATIVE_ACCOUNT_STATE);
}

async function handleSignUp(event, client) {
  const email = event.request?.userAttributes?.email;
  if (email && (await hasGoogleOnlyUser(client, event.userPoolId, email))) {
    log(event.triggerSource, "use-google");
    throw new Error(USE_GOOGLE);
  }
  log(event.triggerSource, "signup-pass-through");
  return event;
}

/**
 * Pre sign-up trigger core. `client` is any object with `send(command)`. Never sets autoConfirmUser or
 * autoVerifyEmail. Lookup failures propagate so the trigger fails closed.
 */
export async function handlePreSignUp(event, client) {
  switch (event.triggerSource) {
    case "PreSignUp_ExternalProvider":
      return handleExternalProvider(event, client);
    case "PreSignUp_SignUp":
      return handleSignUp(event, client);
    default:
      log(event.triggerSource, "pass-through");
      return event;
  }
}
