import { describe, expect, it } from "vitest";
import {
  SIGN_IN_ERROR_COPY,
  SignInSessionError,
  SignInStepRequiredError,
  mapSignInError,
} from "./signInErrors";

function named(name: string, message = "raw cognito message"): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

describe("mapSignInError", () => {
  it("gives identical copy for NotAuthorizedException and UserNotFoundException", () => {
    const a = mapSignInError(named("NotAuthorizedException")).text;
    const b = mapSignInError(named("UserNotFoundException")).text;
    expect(a).toBe(b);
    expect(a).toBe("Incorrect email or password.");
  });

  it("shows incorrect-credentials copy for a Cognito lockout (reported as NotAuthorizedException)", () => {
    const result = mapSignInError(named("NotAuthorizedException", "Password attempts exceeded"));
    expect(result.code).toBe("incorrect-credentials");
    expect(result.text).not.toMatch(/attempts exceeded/i);
  });

  it.each(["LimitExceededException", "TooManyRequestsException", "TooManyFailedAttemptsException"])(
    "maps %s to the too-many-attempts copy",
    (name) => {
      expect(mapSignInError(named(name)).text).toBe(SIGN_IN_ERROR_COPY["too-many-attempts"]);
    }
  );

  it("maps CONFIRM_SIGN_UP and RESET_PASSWORD steps, with a Feedback link", () => {
    const confirm = mapSignInError(new SignInStepRequiredError("CONFIRM_SIGN_UP"));
    expect(confirm.code).toBe("unconfirmed");
    expect(confirm.linkToFeedback).toBe(true);

    const reset = mapSignInError(new SignInStepRequiredError("RESET_PASSWORD"));
    expect(reset.code).toBe("reset-required");
    expect(reset.linkToFeedback).toBe(true);
  });

  it("maps any other step to the unsupported-step copy", () => {
    const result = mapSignInError(new SignInStepRequiredError("CONFIRM_SIGN_IN_WITH_SMS_CODE"));
    expect(result.code).toBe("unsupported-step");
    expect(result.linkToFeedback).toBe(true);
  });

  it("maps NetworkError", () => {
    expect(mapSignInError(named("NetworkError")).text).toBe(SIGN_IN_ERROR_COPY.network);
  });

  it("maps a missing session and unknown errors to the generic copy without a link", () => {
    expect(mapSignInError(new SignInSessionError()).text).toBe(SIGN_IN_ERROR_COPY.generic);
    const unknown = mapSignInError(new Error("some internal detail"));
    expect(unknown.text).toBe(SIGN_IN_ERROR_COPY.generic);
    expect(unknown.linkToFeedback).toBe(false);
  });

  it("maps a string or undefined input to the generic copy", () => {
    expect(mapSignInError("NotAuthorizedException").text).toBe(SIGN_IN_ERROR_COPY.generic);
    expect(mapSignInError(undefined).text).toBe(SIGN_IN_ERROR_COPY.generic);
  });

  it("never returns the raw error message", () => {
    const names = [
      "NotAuthorizedException",
      "UserNotFoundException",
      "LimitExceededException",
      "NetworkError",
      "SomethingElse",
    ];
    for (const name of names) {
      expect(mapSignInError(named(name, "RAW-SECRET-MESSAGE")).text).not.toContain("RAW-SECRET");
    }
  });
});
