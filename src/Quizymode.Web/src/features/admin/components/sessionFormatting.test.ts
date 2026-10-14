import { describe, expect, it } from "vitest";
import {
  describeClient,
  formatDuration,
  shortenUserAgent,
} from "./sessionFormatting";

describe("formatDuration", () => {
  it("renders a bounce as zero seconds", () => {
    expect(formatDuration(0)).toBe("0s");
  });

  it("guards against negative and non-finite input", () => {
    expect(formatDuration(-5)).toBe("0s");
    expect(formatDuration(Number.NaN)).toBe("0s");
  });

  it("renders sub-minute durations in seconds", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("renders minutes with and without a seconds remainder", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(200)).toBe("3m 20s");
  });

  it("renders hours with and without a minutes remainder", () => {
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(4320)).toBe("1h 12m");
  });
});

describe("describeClient", () => {
  it("labels flagged traffic as a bot", () => {
    expect(describeClient("Googlebot/2.1", true)).toBe("Bot");
  });

  it("labels traffic with a known user agent as human", () => {
    expect(describeClient("Mozilla/5.0", false)).toBe("Human");
  });

  it("does not claim rows predating user-agent capture are human", () => {
    expect(describeClient(null, false)).toBe("Unknown UA");
  });
});

describe("shortenUserAgent", () => {
  it("returns null when there is no user agent", () => {
    expect(shortenUserAgent(null)).toBeNull();
  });

  it("leaves short user agents intact", () => {
    expect(shortenUserAgent("curl/8.4.0")).toBe("curl/8.4.0");
  });

  it("truncates long user agents", () => {
    const result = shortenUserAgent("a".repeat(100));
    expect(result).toHaveLength(61);
    expect(result?.endsWith("…")).toBe(true);
  });
});
