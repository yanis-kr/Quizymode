import { describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { DEFAULT_OG_IMAGE, SEO } from "./SEO";

function metaContent(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute("content") ?? null;
}

describe("SEO", () => {
  it("uses the PNG social preview image with its dimensions, type, and alt text by default", async () => {
    render(
      <HelmetProvider>
        <SEO title="Home" />
      </HelmetProvider>
    );

    await waitFor(() => {
      expect(metaContent('meta[property="og:image"]')).toBe(DEFAULT_OG_IMAGE);
    });
    expect(DEFAULT_OG_IMAGE).toMatch(/\.png$/);
    expect(metaContent('meta[name="twitter:image"]')).toBe(DEFAULT_OG_IMAGE);
    expect(metaContent('meta[property="og:image:type"]')).toBe("image/png");
    expect(metaContent('meta[property="og:image:width"]')).toBe("1200");
    expect(metaContent('meta[property="og:image:height"]')).toBe("630");
    expect(metaContent('meta[property="og:image:alt"]')).toBeTruthy();
    expect(metaContent('meta[name="twitter:image:alt"]')).toBeTruthy();
  });

  it("omits default-image dimensions when a custom preview image is supplied", async () => {
    render(
      <HelmetProvider>
        <SEO ogImage="https://www.quizymode.com/custom.jpg" ogImageAlt="Custom preview" />
      </HelmetProvider>
    );

    await waitFor(() => {
      expect(metaContent('meta[property="og:image"]')).toBe(
        "https://www.quizymode.com/custom.jpg"
      );
    });
    expect(metaContent('meta[property="og:image:alt"]')).toBe("Custom preview");
    expect(document.head.querySelector('meta[property="og:image:width"]')).toBeNull();
    expect(document.head.querySelector('meta[property="og:image:type"]')).toBeNull();
  });
});
