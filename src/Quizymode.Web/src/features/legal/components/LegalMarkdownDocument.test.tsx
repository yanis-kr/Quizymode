import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LegalMarkdownDocument from "./LegalMarkdownDocument";

vi.mock("@/components/SEO", () => ({ SEO: () => null }));

function renderDoc(markdown: string) {
  return render(
    <MemoryRouter>
      <LegalMarkdownDocument title="T" description="D" canonical="/t" markdown={markdown} />
    </MemoryRouter>,
  );
}

describe("LegalMarkdownDocument links (#811)", () => {
  it("renders relative, https and mailto links", () => {
    renderDoc("See [privacy](/privacy), [site](https://example.com/a) and [mail us](mailto:hi@example.com).");
    expect(screen.getByRole("link", { name: "privacy" })).toHaveAttribute("href", "/privacy");
    const external = screen.getByRole("link", { name: "site" });
    expect(external).toHaveAttribute("href", "https://example.com/a");
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "noreferrer");
    const mail = screen.getByRole("link", { name: "mail us" });
    expect(mail).toHaveAttribute("href", "mailto:hi@example.com");
    expect(mail).not.toHaveAttribute("target");
  });

  it.each([
    ["javascript", "javascript:alert(1)"],
    ["data", "data:text/html,x"],
    ["vbscript", "vbscript:x"],
    ["file", "file:///etc/passwd"],
    ["http", "http://example.com"],
    ["protocol-relative", "//evil.example"],
  ])("renders a %s destination as plain text with no link", (_name, href) => {
    const { container } = renderDoc(`Click [the label](${href}) now.`);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[href]")).toBeNull();
    // The label stays visible as text (a destination such as javascript:alert(1) leaves a stray ")" after it).
    expect(screen.getByText(/Click the label/)).toBeInTheDocument();
  });
});
