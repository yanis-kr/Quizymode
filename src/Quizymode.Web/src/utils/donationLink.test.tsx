import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import Layout from "@/components/Layout";
import AboutPage from "@/features/about/pages/AboutPage";
import { getDonationHost, resolveDonationUrl } from "./donationLink";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false, logout: vi.fn(), username: null, email: null, isAdmin: false }),
}));
vi.mock("@/api/users", () => ({
  usersApi: { getCurrent: vi.fn(), getPolicyAcceptanceStatus: vi.fn() },
}));
vi.mock("@/api/learningLoop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/learningLoop")>()),
  dailyQuizApi: { get: vi.fn() },
}));
vi.mock("@/components/UserProfileModal", () => ({ default: () => null }));
vi.mock("@/features/feedback/components/FeedbackDialog", () => ({ default: () => null }));

const DONATION_URL = "https://ko-fi.com/example";

function renderShell(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/about"]}>
          <Layout>
            <AboutPage />
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

function donationLinks(): HTMLElement[] {
  return screen.queryAllByRole("link", { name: /Support Quizymode/ });
}

describe("donation link rendering (#497)", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    vi.stubGlobal("__ABOUT_HTML__", "<p>About body</p>");
    vi.stubGlobal("__APP_VERSION__", "0.0.0");
    vi.stubGlobal("__BUILD_LABEL__", "test");
    vi.stubGlobal("__BUILD_TIME__", "2026-01-01");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("A1: renders no donation link in the footer or About when VITE_DONATION_URL is unset", () => {
    vi.stubEnv("VITE_DONATION_URL", "");
    renderShell();
    expect(donationLinks()).toHaveLength(0);
    expect(screen.queryByText(/not tax-deductible/)).not.toBeInTheDocument();
  });

  it("A2: renders footer and About links with href, target, rel and aria-label when set to https", () => {
    vi.stubEnv("VITE_DONATION_URL", DONATION_URL);
    renderShell();
    const links = donationLinks();
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", DONATION_URL);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveAttribute("aria-label", "Support Quizymode (opens ko-fi.com in a new tab)");
    }
  });

  it.each(["http://ko-fi.com/example", "javascript:alert(1)", "not a url"])(
    "A3: hides the link for invalid value %s",
    (value) => {
      vi.stubEnv("VITE_DONATION_URL", value);
      renderShell();
      expect(donationLinks()).toHaveLength(0);
    }
  );

  it("A4: About copy says donations are voluntary once, non-refundable and not tax-deductible", () => {
    vi.stubEnv("VITE_DONATION_URL", DONATION_URL);
    renderShell();
    const paragraph = screen.getByText(/Quizymode is free to use/).closest("p");
    const text = paragraph?.textContent ?? "";
    expect(text).toContain("Donations are not tax-deductible.");
    expect(text.match(/voluntary/g)).toHaveLength(1);
    expect(text).not.toMatch(/Placeholder copy/);
  });
});

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
