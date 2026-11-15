import { describe, expect, it } from "vitest";
import {
  PASSWORD_RESET_ERROR_COPY,
  mapPasswordResetError,
  passwordResetErrorCode,
} from "./passwordResetErrors";

function named(name: string): Error {
  const e = new Error("raw cognito message");
  e.name = name;
  return e;
}

describe("passwordResetErrors", () => {
  it.each([
    ["CodeMismatchException", "invalid-code"],
    ["ExpiredCodeException", "invalid-code"],
    ["LimitExceededException", "too-many-attempts"],
    ["TooManyRequestsException", "too-many-attempts"],
    ["InvalidPasswordException", "weak-password"],
    ["NetworkError", "network"],
    ["Whatever", "generic"],
  ] as const)("classifies %s as %s", (name, code) => {
    expect(passwordResetErrorCode(named(name))).toBe(code);
    expect(mapPasswordResetError(named(name))).toBe(PASSWORD_RESET_ERROR_COPY[code]);
  });

  it("never returns the raw message and handles non-Error values", () => {
    expect(mapPasswordResetError("string")).toBe(PASSWORD_RESET_ERROR_COPY.generic);
    expect(mapPasswordResetError(named("CodeMismatchException"))).not.toContain("raw");
  });
});
