import { describe, expect, it } from "vitest";
import { getApiErrorMessage, getServerErrorMessage } from "./apiError";
import { refusal } from "@/test/refusal";

describe("getApiErrorMessage", () => {
  it("prefers problem details detail text", () => {
    const error = Object.assign(new Error("Request failed"), {
      response: {
        status: 400,
        data: {
          detail: "Validation failed",
          title: "Bad Request",
        },
      },
    });

    expect(getApiErrorMessage(error)).toBe("[400] Validation failed");
  });

  it("falls back to title, then status and message, then stringification", () => {
    const titleError = Object.assign(new Error("Request failed"), {
      response: {
        status: 401,
        data: {
          title: "Unauthorized",
        },
      },
    });

    const statusError = Object.assign(new Error("Server exploded"), {
      response: {
        status: 500,
        data: {},
      },
    });

    expect(getApiErrorMessage(titleError)).toBe("[401] Unauthorized");
    expect(getApiErrorMessage(statusError)).toBe("HTTP 500: Server exploded");
    expect(getApiErrorMessage("plain-string-error")).toBe("plain-string-error");
  });
});

describe("getServerErrorMessage (AC 17.8)", () => {
  it("returns the server detail without a status prefix", () => {
    expect(getServerErrorMessage(refusal("Daily limit reached."), "Fallback")).toBe("Daily limit reached.");
  });

  it("uses the fallback when there is no server message", () => {
    expect(getServerErrorMessage(refusal(""), "Fallback")).toBe("Fallback");
    expect(getServerErrorMessage(new Error("Network Error"), "Fallback")).toBe("Fallback");
  });
});
