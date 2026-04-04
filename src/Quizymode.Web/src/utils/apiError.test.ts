import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "./apiError";

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
