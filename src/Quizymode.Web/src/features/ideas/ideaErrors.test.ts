import { describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import { getIdeaErrorMessage } from "./ideaErrors";

function apiError(status: number, title?: string, detail?: string) {
  const error = new AxiosError("Request failed");
  error.response = {
    status,
    statusText: "",
    headers: {},
    config: {} as never,
    data: { title, detail },
  };
  return error;
}

describe("getIdeaErrorMessage", () => {
  it("maps duplicate conflicts", () => {
    expect(getIdeaErrorMessage(apiError(409, "Ideas.Duplicate"))).toMatch(
      /already submitted/i
    );
  });

  it("maps the daily limit", () => {
    expect(
      getIdeaErrorMessage(apiError(409, "Ideas.DailyLimitExceeded"))
    ).toMatch(/daily limit/i);
  });

  it("maps blocked profanity for ideas and comments", () => {
    expect(
      getIdeaErrorMessage(apiError(400, "Ideas.ProfanityBlocked"))
    ).toMatch(/idea contains language/i);
    expect(
      getIdeaErrorMessage(apiError(400, "IdeaComments.ProfanityBlocked"))
    ).toMatch(/comment contains language/i);
  });

  it("maps 429 rate limits regardless of body", () => {
    expect(getIdeaErrorMessage(apiError(429))).toMatch(/too quickly.*wait a few minutes/i);
  });

  it("falls back to the generic message for unknown codes", () => {
    expect(
      getIdeaErrorMessage(apiError(400, "Ideas.TitleTooShort", "Too short"))
    ).toBe("[400] Too short");
  });
});
