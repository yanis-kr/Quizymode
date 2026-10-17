import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureAttribution, getCapturedAttribution } from "./attributionCapture";

function setReferrer(value: string): void {
  Object.defineProperty(document, "referrer", {
    value,
    configurable: true,
  });
}

function setLocationSearch(pathAndQuery: string): void {
  window.history.pushState({}, "", pathAndQuery);
}

describe("attributionCapture", () => {
  const originalReferrer = document.referrer;

  beforeEach(() => {
    sessionStorage.clear();
    setLocationSearch("/");
  });

  afterEach(() => {
    setReferrer(originalReferrer);
  });

  it("captures the referrer and UTM tags from the current URL", () => {
    setReferrer("https://www.google.com/search");
    setLocationSearch(
      "/categories/science?utm_source=newsletter&utm_medium=email&utm_campaign=spring&utm_content=cta&utm_term=quiz"
    );

    captureAttribution();
    const captured = getCapturedAttribution();

    expect(captured).toEqual({
      referrer: "https://www.google.com/search",
      utmSource: "newsletter",
      utmMedium: "email",
      utmCampaign: "spring",
      utmContent: "cta",
      utmTerm: "quiz",
    });
  });

  it("captures ad click-id params", () => {
    setLocationSearch(
      "/?gclid=g1&gbraid=g2&wbraid=g3&msclkid=m1&ttclid=t1"
    );

    captureAttribution();
    const captured = getCapturedAttribution();

    expect(captured).toMatchObject({
      gclid: "g1",
      gbraid: "g2",
      wbraid: "g3",
      msclkid: "m1",
      ttclid: "t1",
    });
  });

  it("stores a null referrer when there is none, and omits absent tags", () => {
    setReferrer("");
    setLocationSearch("/");

    captureAttribution();
    const captured = getCapturedAttribution();

    expect(captured).toEqual({ referrer: null });
  });

  it("captures before a later URL rewrite removes the query string", () => {
    setLocationSearch("/quiz?utm_source=ad-network&gclid=click123");

    captureAttribution();

    // Simulate QuizModePage/ExploreModePage rewriting the URL after mount.
    setLocationSearch("/quiz");

    const captured = getCapturedAttribution();

    expect(captured).toMatchObject({
      utmSource: "ad-network",
      gclid: "click123",
    });
  });

  it("returns null when nothing has been captured", () => {
    expect(getCapturedAttribution()).toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    const originalSetItem = window.sessionStorage.setItem;
    window.sessionStorage.setItem = () => {
      throw new Error("storage blocked");
    };

    expect(() => captureAttribution()).not.toThrow();

    window.sessionStorage.setItem = originalSetItem;
  });
});
