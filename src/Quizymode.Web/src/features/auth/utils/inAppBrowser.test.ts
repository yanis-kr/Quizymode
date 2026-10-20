import { describe, expect, it } from "vitest";
import { isEmbeddedWebView } from "./inAppBrowser";

describe("isEmbeddedWebView", () => {
  it.each([
    [
      "Instagram",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/21A329 Instagram 300.0.0.0",
    ],
    [
      "Facebook",
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.0;]",
    ],
    ["Facebook iOS", "Mozilla/5.0 (iPhone) AppleWebKit/605 Mobile [FBAN/FBIOS;FBAV/440.0]"],
    ["TikTok", "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 musical_ly_31.0.0 BytedanceWebview/d8a21c6"],
    ["LinkedIn", "Mozilla/5.0 (iPhone) AppleWebKit/605 Mobile LinkedInApp"],
    ["Snapchat", "Mozilla/5.0 (iPhone) AppleWebKit/605 Mobile Snapchat/12.0"],
    ["Line", "Mozilla/5.0 (iPhone) AppleWebKit/605 Mobile Safari Line/13.0.0"],
    ["Android WebView", "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 Version/4.0 Chrome/120"],
  ])("detects %s", (_name, userAgent) => {
    expect(isEmbeddedWebView(userAgent)).toBe(true);
  });

  it.each([
    ["Chrome desktop", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"],
    ["Safari iOS", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1"],
    ["Chrome Android", "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"],
    ["Google Search app", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 GSA/300.0 Mobile/15E148 Safari/604.1"],
    ["a name that merely ends in line", "Mozilla/5.0 Baseline/1.0"],
  ])("does not flag %s", (_name, userAgent) => {
    expect(isEmbeddedWebView(userAgent)).toBe(false);
  });

  it("handles missing user agents", () => {
    expect(isEmbeddedWebView(undefined)).toBe(false);
    expect(isEmbeddedWebView("")).toBe(false);
  });
});
