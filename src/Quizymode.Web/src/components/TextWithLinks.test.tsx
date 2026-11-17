import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextWithLinks } from "./TextWithLinks";

function renderText(text: string) {
  return render(<TextWithLinks text={text} />);
}

describe("TextWithLinks (#752)", () => {
  it("links a plain https URL with safe link attributes", () => {
    const { container } = renderText("See https://example.com/docs for details.");

    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("https://example.com/docs");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.textContent).toBe("See https://example.com/docs for details.");
  });

  it("links http URLs and keeps trailing punctuation outside the link", () => {
    const { container } = renderText("(http://example.org/a), then done");

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("http://example.org/a");
    expect(link?.textContent).toBe("http://example.org/a");
    expect(container.textContent).toBe("(http://example.org/a), then done");
  });

  it("never creates a link for javascript: URLs", () => {
    const { container } = renderText("javascript:alert(1)");

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("javascript:alert(1)");
  });

  it("does not link text that only starts with http:// without a host", () => {
    const { container } = renderText("http:// is not a link");

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("http:// is not a link");
  });

  it("renders HTML in the text as plain text, never as markup", () => {
    const { container } = renderText('<img src=x onerror="alert(1)"> https://example.com/x');

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com/x");
  });
});
