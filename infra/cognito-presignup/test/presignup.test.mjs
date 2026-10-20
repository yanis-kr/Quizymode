import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handlePreSignUp } from "../lib/presignup.mjs";
import {
  ACCOUNT_LINKED,
  GOOGLE_EMAIL_UNVERIFIED,
  NATIVE_ACCOUNT_STATE,
  USE_GOOGLE,
} from "../lib/errors.mjs";

const POOL_ID = "us-east-1_TestPool";

function externalEvent(overrides = {}) {
  return {
    triggerSource: "PreSignUp_ExternalProvider",
    userPoolId: POOL_ID,
    userName: "Google_1234567890",
    request: { userAttributes: { email: "Jane@Example.com", email_verified: "true", name: "Jane" } },
    response: {},
    ...overrides,
  };
}

function signUpEvent(email = "jane@example.com") {
  return {
    triggerSource: "PreSignUp_SignUp",
    userPoolId: POOL_ID,
    userName: email,
    request: { userAttributes: { email } },
    response: {},
  };
}

function nativeUser(overrides = {}) {
  return {
    Username: "native-sub-1",
    UserStatus: "CONFIRMED",
    UserAttributes: [
      { Name: "email", Value: "jane@example.com" },
      { Name: "email_verified", Value: "true" },
    ],
    ...overrides,
  };
}

/** Fake client keyed by command class name; records every command sent. */
function fakeClient(handlers) {
  const sent = [];
  return {
    sent,
    async send(command) {
      const name = command.constructor.name;
      sent.push({ name, input: command.input });
      const handler = handlers[name];
      if (!handler) {
        throw new Error(`Unexpected command ${name}`);
      }
      return handler(command.input);
    },
  };
}

function notFound() {
  const error = new Error("User does not exist.");
  error.name = "UserNotFoundException";
  return error;
}

async function rejectsWith(promise, sentinel) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.message, sentinel);
    return true;
  });
}

describe("PreSignUp_ExternalProvider", () => {
  it("links a verified Google identity to a confirmed, verified password account and throws QM_ACCOUNT_LINKED", async () => {
    const client = fakeClient({
      AdminGetUserCommand: () => nativeUser(),
      AdminLinkProviderForUserCommand: () => ({}),
    });

    await rejectsWith(handlePreSignUp(externalEvent(), client), ACCOUNT_LINKED);

    assert.deepEqual(
      client.sent.map((call) => call.name),
      ["AdminGetUserCommand", "AdminLinkProviderForUserCommand"],
    );
    assert.deepEqual(client.sent[0].input, { UserPoolId: POOL_ID, Username: "Jane@Example.com" });
    assert.deepEqual(client.sent[1].input, {
      UserPoolId: POOL_ID,
      DestinationUser: { ProviderName: "Cognito", ProviderAttributeValue: "native-sub-1" },
      SourceUser: {
        ProviderName: "Google",
        ProviderAttributeName: "Cognito_Subject",
        ProviderAttributeValue: "1234567890",
      },
    });
  });

  it("splits the federated user name on the first underscore only", async () => {
    const client = fakeClient({
      AdminGetUserCommand: () => nativeUser(),
      AdminLinkProviderForUserCommand: () => ({}),
    });

    await rejectsWith(handlePreSignUp(externalEvent({ userName: "Google_12_34" }), client), ACCOUNT_LINKED);

    assert.equal(client.sent[1].input.SourceUser.ProviderAttributeValue, "12_34");
  });

  it("returns the event unchanged when no password account exists", async () => {
    const client = fakeClient({
      AdminGetUserCommand: () => {
        throw notFound();
      },
    });
    const event = externalEvent();

    const result = await handlePreSignUp(event, client);

    assert.equal(result, event);
    assert.equal(result.response.autoConfirmUser, undefined);
    assert.equal(result.response.autoVerifyEmail, undefined);
    assert.deepEqual(client.sent.map((call) => call.name), ["AdminGetUserCommand"]);
  });

  it("deletes an UNCONFIRMED password account and lets Cognito create the Google user", async () => {
    const client = fakeClient({
      AdminGetUserCommand: () => nativeUser({ UserStatus: "UNCONFIRMED" }),
      AdminDeleteUserCommand: () => ({}),
    });
    const event = externalEvent();

    const result = await handlePreSignUp(event, client);

    assert.equal(result, event);
    assert.deepEqual(client.sent.map((call) => call.name), ["AdminGetUserCommand", "AdminDeleteUserCommand"]);
    assert.deepEqual(client.sent[1].input, { UserPoolId: POOL_ID, Username: "native-sub-1" });
  });

  for (const status of ["FORCE_CHANGE_PASSWORD", "RESET_REQUIRED", "ARCHIVED"]) {
    it(`fails closed for a ${status} password account`, async () => {
      const client = fakeClient({ AdminGetUserCommand: () => nativeUser({ UserStatus: status }) });

      await rejectsWith(handlePreSignUp(externalEvent(), client), NATIVE_ACCOUNT_STATE);

      assert.deepEqual(client.sent.map((call) => call.name), ["AdminGetUserCommand"]);
    });
  }

  it("fails closed for a confirmed password account whose email is not verified", async () => {
    const client = fakeClient({
      AdminGetUserCommand: () => nativeUser({ UserAttributes: [{ Name: "email", Value: "jane@example.com" }, { Name: "email_verified", Value: "false" }] }),
    });

    await rejectsWith(handlePreSignUp(externalEvent(), client), NATIVE_ACCOUNT_STATE);

    assert.deepEqual(client.sent.map((call) => call.name), ["AdminGetUserCommand"]);
  });

  it("fails closed when the account AdminGetUser returned has a different email", async () => {
    const client = fakeClient({
      AdminGetUserCommand: () => nativeUser({ UserAttributes: [{ Name: "email", Value: "other@example.com" }, { Name: "email_verified", Value: "true" }] }),
    });

    await rejectsWith(handlePreSignUp(externalEvent(), client), NATIVE_ACCOUNT_STATE);

    assert.deepEqual(client.sent.map((call) => call.name), ["AdminGetUserCommand"]);
  });

  it("rejects an unverified Google email without touching the pool", async () => {
    const client = fakeClient({});
    const event = externalEvent({ request: { userAttributes: { email: "jane@example.com", email_verified: "false" } } });

    await rejectsWith(handlePreSignUp(event, client), GOOGLE_EMAIL_UNVERIFIED);

    assert.equal(client.sent.length, 0);
  });

  it("rejects a Google identity with no email_verified attribute", async () => {
    const client = fakeClient({});
    const event = externalEvent({ request: { userAttributes: { email: "jane@example.com" } } });

    await rejectsWith(handlePreSignUp(event, client), GOOGLE_EMAIL_UNVERIFIED);

    assert.equal(client.sent.length, 0);
  });

  it("accepts a boolean-like email_verified in any case", async () => {
    const client = fakeClient({
      AdminGetUserCommand: () => {
        throw notFound();
      },
    });
    const event = externalEvent({ request: { userAttributes: { email: "jane@example.com", email_verified: "True" } } });

    assert.equal(await handlePreSignUp(event, client), event);
  });

  it("looks the password account up with the Google email as sent so the pool applies its own case rules", async () => {
    const client = fakeClient({ AdminGetUserCommand: () => nativeUser(), AdminLinkProviderForUserCommand: () => ({}) });

    await rejectsWith(handlePreSignUp(externalEvent(), client), ACCOUNT_LINKED);

    assert.equal(client.sent[0].input.Username, "Jane@Example.com");
  });

  it("propagates lookup failures (fail closed)", async () => {
    const client = fakeClient({
      AdminGetUserCommand: () => {
        throw new Error("ThrottlingException");
      },
    });

    await assert.rejects(handlePreSignUp(externalEvent(), client), /ThrottlingException/);
  });

  it("propagates link failures instead of reporting a link", async () => {
    const client = fakeClient({
      AdminGetUserCommand: () => nativeUser(),
      AdminLinkProviderForUserCommand: () => {
        throw new Error("LimitExceededException");
      },
    });

    await assert.rejects(handlePreSignUp(externalEvent(), client), /LimitExceededException/);
  });

  it("passes through other providers", async () => {
    const client = fakeClient({});
    const event = externalEvent({ userName: "Facebook_1" });

    assert.equal(await handlePreSignUp(event, client), event);
    assert.equal(client.sent.length, 0);
  });
});

describe("PreSignUp_SignUp", () => {
  it("rejects a password sign-up whose email belongs to a Google-only account", async () => {
    const client = fakeClient({
      ListUsersCommand: () => ({ Users: [{ Username: "Google_1", UserStatus: "EXTERNAL_PROVIDER" }] }),
    });

    await rejectsWith(handlePreSignUp(signUpEvent(), client), USE_GOOGLE);

    assert.deepEqual(client.sent[0].input, {
      UserPoolId: POOL_ID,
      Filter: 'email = "jane@example.com"',
      Limit: 10,
    });
  });

  it("queries the lower-cased email and falls back to the raw value when it differs", async () => {
    const client = fakeClient({ ListUsersCommand: () => ({ Users: [] }) });
    const event = signUpEvent("Jane@Example.com");

    assert.equal(await handlePreSignUp(event, client), event);
    assert.deepEqual(
      client.sent.map((call) => call.input.Filter),
      ['email = "jane@example.com"', 'email = "Jane@Example.com"'],
    );
  });

  it("allows a sign-up when only password accounts share the email", async () => {
    const client = fakeClient({
      ListUsersCommand: () => ({ Users: [{ Username: "native", UserStatus: "CONFIRMED" }] }),
    });
    const event = signUpEvent();

    assert.equal(await handlePreSignUp(event, client), event);
    assert.equal(event.response.autoConfirmUser, undefined);
    assert.equal(event.response.autoVerifyEmail, undefined);
  });

  it("does not embed quote characters in a filter", async () => {
    const client = fakeClient({ ListUsersCommand: () => ({ Users: [] }) });
    const event = signUpEvent('a"b@example.com');

    assert.equal(await handlePreSignUp(event, client), event);
    assert.equal(client.sent.length, 0);
  });

  it("propagates ListUsers failures (fail closed)", async () => {
    const client = fakeClient({
      ListUsersCommand: () => {
        throw new Error("AccessDeniedException");
      },
    });

    await assert.rejects(handlePreSignUp(signUpEvent(), client), /AccessDeniedException/);
  });
});

describe("other trigger sources", () => {
  it("passes AdminCreateUser through untouched", async () => {
    const client = fakeClient({});
    const event = { triggerSource: "PreSignUp_AdminCreateUser", userPoolId: POOL_ID, request: {}, response: {} };

    assert.equal(await handlePreSignUp(event, client), event);
    assert.equal(client.sent.length, 0);
  });
});
