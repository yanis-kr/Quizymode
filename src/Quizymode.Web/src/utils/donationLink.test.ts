import { describe, expect, it } from "vitest";
import { getDonationHost, resolveDonationUrl } from "./donationLink";

describe("resolveDonationUrl", () => {
  it("returns undefined when the URL is unset or blank", () => {
    expect(resolveDonationUrl(undefined)).toBeUndefined();
    expect(resolveDonationUrl("")).toBeUndefined();
    expect(resolveDonationUrl("   ")).toBeUndefined();
  });

  it("accepts https URLs and trims whitespace", () => {
    expect(resolveDonationUrl("  https://ko-fi.com/quizymode  ")).toBe("https://ko-fi.com/quizymode");
  });

  it("rejects non-https and malformed URLs", () => {
    expect(resolveDonationUrl("http://ko-fi.com/quizymode")).toBeUndefined();
    expect(resolveDonationUrl("javascript:alert(1)")).toBeUndefined();
    expect(resolveDonationUrl("not a url")).toBeUndefined();
  });

  it("derives a host label without www", () => {
    expect(getDonationHost("https://www.ko-fi.com/quizymode")).toBe("ko-fi.com");
  });
});
