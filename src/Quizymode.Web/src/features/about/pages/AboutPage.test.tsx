/**
 * About page copy, structure, links and images (#883, #884, #885). The AC ids in the test names are the ids in docs/AC.md.
 * The starter pool request fails here, so the hook shows its static fallback question.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import AboutPage from "./AboutPage";
import { ABOUT_CANONICAL, ABOUT_SEO_DESCRIPTION, ABOUT_SEO_TITLE } from "../aboutSeo";
import { GITHUB_REPO_URL, LINKEDIN_URL, MEDIUM_STORY_URL } from "@/utils/projectLinks";
import { USER_GUIDE_URL } from "@/utils/userGuideLink";
import { collectionsApi } from "@/api/collections";
import type { CollectionResponse } from "@/types/api";

vi.mock("@/api/starter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/starter")>()),
  starterApi: { getPool: vi.fn(() => Promise.reject(new Error("offline"))) },
}));
vi.mock("@/api/collections", () => ({
  collectionsApi: { getById: vi.fn() },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false, logout: vi.fn(), username: null, email: null, isAdmin: false }),
}));

const AHA_ID = "e0eaca22-3e39-4f07-92e6-046baab0d3ea";
const SOUNDS_FAKE_ID = "3c85dfe2-4365-406d-8056-d30bc451dd20";
const LANDMARKS_ID = "abdbb0fd-ea31-4890-8a20-831592be74e3";
const PUBLIC_ABOUT_DIR = path.join(process.cwd(), "public", "about");
const getById = vi.mocked(collectionsApi.getById);

function collection(id: string, name: string, itemCount: number, description: string): CollectionResponse {
  return { id, name, description, itemCount, createdBy: "seeder", createdAt: "2026-04-08T00:00:00Z", isPublic: true };
}

const COLLECTIONS: Record<string, CollectionResponse> = {
  [AHA_ID]: collection(AHA_ID, "Aha Moment Trivia", 33, "Clue-driven trivia."),
  [SOUNDS_FAKE_ID]: collection(SOUNDS_FAKE_ID, "Sounds Fake, But It's True", 12, "Surprising facts that feel made up."),
  [LANDMARKS_ID]: collection(LANDMARKS_ID, "Landmarks from Sideways Clues", 12, "Famous places from indirect clues."),
};
const REPO_ROOT = path.resolve(process.cwd(), "..", "..");

const SECTION_HEADINGS = [
  "Here's one. Nobody is keeping score.",
  "Same questions, five moods.",
  "Hand over your notes. Get a quiz back.",
  "Small habits, no guilt trips.",
  "Start with something odd.",
  "One engineer, a crew of AI agents, and a lot of checklists.",
  "Why this exists",
];

const BANNED_WORDS = ["seamless", "unlock", "empower", "supercharge", "journey", "revolutionize", "ai-powered"];
const PAID_WORK = ["hire", "available for", "consulting", "freelance", "contact me to build"];
// Every number in the issue copy; anything else in static text is an invented number.
const ALLOWED_NUMBERS = new Set(["1", "3", "4", "5", "7", "10", "14", "16", "19", "20", "30", "195"]);

function renderAbout(): HTMLElement {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/about"]}>
          <AboutPage />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
  return container;
}

/** Page text without build metadata and the credits block, which comes from docs/about.md. */
function staticCopy(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-testid="about-version"], [data-testid="about-credits"]').forEach((node) => node.remove());
  return clone.textContent ?? "";
}

function linkByName(name: string | RegExp): HTMLElement {
  return screen.getByRole("link", { name });
}

function expectExternal(link: HTMLElement, href: string): void {
  expect(link).toHaveAttribute("href", href);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
}

describe("AboutPage (#883)", () => {
  beforeEach(() => {
    getById.mockReset();
    getById.mockRejectedValue(new Error("offline"));
    vi.stubGlobal("__ABOUT_HTML__", "<p><strong>Image credits.</strong> Country flag pictures are files from <a href=\"https://commons.wikimedia.org/\">Wikimedia Commons</a>. All flag files are marked public domain on Commons. The flag of Oman comes from the public-domain CIA World Factbook set.</p>");
    vi.stubGlobal("__APP_VERSION__", "9.9.9");
    vi.stubGlobal("__BUILD_LABEL__", "test");
    vi.stubGlobal("__BUILD_TIME__", "2026-01-01");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("AC 3.0.38 signed out, nothing asks to sign in or sign up", () => {
    renderAbout();
    expect(screen.queryByRole("link", { name: /sign in|sign up|log in|create account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign in|sign up|log in|create account/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("A quiz app that got a little out of hand.");
  });

  it("AC 3.0.39 one h1, one h2 per section in order, h3 only inside How it's built", () => {
    const container = renderAbout();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const h2s = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2s).toEqual(SECTION_HEADINGS);
    const h3s = Array.from(container.querySelectorAll("h3"));
    expect(h3s).toHaveLength(3);
    const built = screen.getByRole("region", { name: SECTION_HEADINGS[5] });
    for (const h3 of h3s) expect(built).toContainElement(h3);
    expect(container.querySelectorAll("h4, h5, h6")).toHaveLength(0);
  });

  it("AC 3.0.40 the notes section states sign-in, limits, on-device reading and review, with no overclaim", () => {
    renderAbout();
    const section = screen.getByRole("region", { name: SECTION_HEADINGS[2] });
    const text = section.textContent ?? "";
    expect(text).toContain("Sign-in required.");
    expect(text).toContain("Daily and monthly limits apply.");
    expect(text).toContain("limited to 20 pages");
    expect(text).toContain("read on your device");
    expect(text).toContain("drafts multiple-choice questions");
    expect(text).toContain("Nothing is saved until you say so.");
    expect(text).toContain("Keep the good questions, bin the rest.");
    expect(text).not.toMatch(/unlimited|instant|accurate|guaranteed/i);
    expect(text).not.toMatch(/not supported|unsupported/i);
  });

  it("AC 3.0.41 names the five games and links the mode cards and CTAs to public routes", () => {
    renderAbout();
    const learn = screen.getByRole("region", { name: SECTION_HEADINGS[1] });
    for (const game of ["Match Race", "Swipe Blitz", "Survival", "Bucket Drop", "Sort It"]) {
      expect(learn).toHaveTextContent(game);
    }
    const cards = within(learn);
    expect(cards.getByRole("link", { name: "Try Quiz" })).toHaveAttribute("href", `/quiz/collections/${AHA_ID}`);
    expect(cards.getByRole("link", { name: "Try Flashcards" })).toHaveAttribute("href", `/explore/collections/${AHA_ID}`);
    expect(cards.getByRole("link", { name: "Try Learn" })).toHaveAttribute("href", `/learn/collections/${AHA_ID}`);
    expect(cards.getByRole("link", { name: "Try Games" })).toHaveAttribute("href", `/games/collections/${AHA_ID}`);
    expect(linkByName("Try 5 questions")).toHaveAttribute("href", "/start");
    expect(linkByName("Browse topics")).toHaveAttribute("href", "/categories");
    // The collection cards are covered by AC 3.0.58; with every collection failing, only the featured link remains.
    expect(linkByName("All featured sets")).toHaveAttribute("href", "/featured");
    expect(screen.queryByTestId("about-collection-card")).not.toBeInTheDocument();
  });

  it("AC 3.0.42 the donation paragraph shows only for an https URL and keeps its disclosures", () => {
    vi.stubEnv("VITE_DONATION_URL", "https://ko-fi.com/example");
    const { unmount } = render(
      <HelmetProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <AboutPage />
          </MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>
    );
    const link = screen.getByRole("link", { name: "Support Quizymode (opens ko-fi.com in a new tab)" });
    expectExternal(link, "https://ko-fi.com/example");
    const text = link.closest("p")?.textContent ?? "";
    expect(text).toContain("Quizymode is free to use.");
    expect(text).toContain("voluntary");
    expect(text).toContain("non-refundable by Quizymode");
    expect(text).toContain("do not grant extra features");
    expect(text).toContain("Donations are not tax-deductible.");
    unmount();
    vi.stubEnv("VITE_DONATION_URL", "http://ko-fi.com/example");
    renderAbout();
    expect(screen.queryByRole("link", { name: /Support Quizymode/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/not tax-deductible/)).not.toBeInTheDocument();
  });

  it("AC 3.0.43 the Image credits text is on the page", () => {
    renderAbout();
    const credits = screen.getByTestId("about-credits");
    expect(credits).toHaveTextContent("Wikimedia Commons");
    expect(credits).toHaveTextContent("public domain");
    expect(credits).toHaveTextContent("Oman");
  });

  it("AC 3.0.43 docs/about.md holds only the credits and renders no heading", () => {
    const markdown = fs.readFileSync(path.join(REPO_ROOT, "docs", "about.md"), "utf8");
    expect(markdown).toContain("Image credits");
    expect(markdown).toContain("Wikimedia Commons");
    expect(markdown).toContain("Oman");
    expect(markdown).not.toMatch(/^#/m);
  });

  it("AC 3.0.44 the version line is the last text on the page, text-xs and muted", () => {
    const container = renderAbout();
    const version = screen.getByTestId("about-version");
    expect(version).toHaveTextContent("Version 9.9.9");
    expect(version).toHaveTextContent("Build test");
    expect(version).toHaveClass("text-xs", "text-slate-400");
    const paragraphs = Array.from(container.querySelectorAll("p"));
    expect(paragraphs[paragraphs.length - 1]).toBe(version);
  });

  it("AC 3.0.45 User Guide, Feedback, Medium and GitHub links are present; external ones open safely", () => {
    renderAbout();
    expectExternal(linkByName("Open the User Guide"), USER_GUIDE_URL);
    expectExternal(linkByName("The longer story on Medium"), MEDIUM_STORY_URL);
    expectExternal(linkByName("Source on GitHub"), GITHUB_REPO_URL);
    expect(linkByName("Send feedback")).toHaveAttribute("href", "/feedback");
  });

  it("AC 3.0.46 the copy has no owner markers, banned words or invented numbers", async () => {
    const container = renderAbout();
    // The static fallback question is part of the page copy (AC 3.0.55).
    await screen.findByTestId("about-hook-question");
    const text = staticCopy(container);
    expect(text).not.toContain("[OWNER");
    for (const word of BANNED_WORDS) expect(text.toLowerCase()).not.toContain(word);
    const numbers = text.match(/\d+/g) ?? [];
    for (const n of numbers) expect(ALLOWED_NUMBERS, `unexpected number ${n}`).toContain(n);
    expect(text).toContain("I built Quizymode to study for my AWS exam and give my kids a place to practice what they were learning.");
  });

  it("AC 3.0.47 How it's built is text only, with three blocks, five guard rails, the stack line and the GitHub link", () => {
    renderAbout();
    const built = screen.getByRole("region", { name: SECTION_HEADINGS[5] });
    const blocks = within(built).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(blocks).toEqual([
      "The spec is the boss.",
      "Refinement: all the questions, asked once.",
      "Autopilot, with a lead agent in the owner’s chair.",
    ]);
    expect(within(screen.getByTestId("about-guard-rails")).getAllByRole("listitem")).toHaveLength(5);
    expect(built).toHaveTextContent(".NET 10 Minimal API, React 19, PostgreSQL, AWS Cognito, CloudFront, Grafana Cloud.");
    expect(built.querySelectorAll("img, svg, picture")).toHaveLength(0);
    expectExternal(within(built).getByRole("link", { name: "Source on GitHub" }), GITHUB_REPO_URL);
    expect(built.textContent ?? "").not.toMatch(/\d[\d,]*\s+(commits?|pull requests?|PRs?|tests?|lines?|users?)\b/i);
  });

  it("AC 3.0.48 the LinkedIn link is a greeting constant, and nothing offers paid work", () => {
    const container = renderAbout();
    expect(LINKEDIN_URL).toMatch(/^https:\/\//);
    const link = linkByName("say hello on LinkedIn");
    expectExternal(link, LINKEDIN_URL);
    const page = (container.textContent ?? "").toLowerCase();
    const readme = fs.readFileSync(path.join(REPO_ROOT, "README.md"), "utf8").toLowerCase();
    for (const phrase of PAID_WORK) {
      expect(page).not.toContain(phrase);
      expect(readme).not.toContain(phrase);
    }
  });

  it("AC 3.0.49 README starts with the new story, keeps Stack onward, and its relative links resolve", () => {
    const readme = fs.readFileSync(path.join(REPO_ROOT, "README.md"), "utf8").replace(/\r\n/g, "\n");
    expect(readme.startsWith("# Quizymode\n\nA study and quiz app that got a little out of hand.")).toBe(true);
    const stackAt = readme.indexOf("\n## Stack\n");
    expect(stackAt).toBeGreaterThan(0);
    const top = readme.slice(0, stackAt);
    expect(top).toContain("## What it does");
    expect(top).toContain("## Why the repository might interest you");
    expect(top).toContain("![Quizymode home page as a guest on www.quizymode.com](docs/images/guest-home.jpg)");
    expect(top).not.toContain("What Matters Most");
    const rest = readme.slice(stackAt);
    for (const heading of ["## Architecture", "## Local Development", "## License"]) expect(rest).toContain(heading);
    const targets = Array.from(top.matchAll(/\]\(([^)]+)\)/g), (m) => m[1]).filter((t) => !/^https?:/.test(t));
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(fs.existsSync(path.join(REPO_ROOT, target.split("#")[0])), target).toBe(true);
    }
  });

  it("AC 3.0.50 sets the SEO title, description and unchanged canonical; llms.txt describes About in one line", async () => {
    renderAbout();
    await waitFor(() => expect(document.title).toBe(`${ABOUT_SEO_TITLE} | Quizymode`));
    expect(ABOUT_SEO_TITLE).toBe("About Quizymode: quizzes, games, and how it's built");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(ABOUT_SEO_DESCRIPTION);
    expect(ABOUT_SEO_DESCRIPTION).toBe(
      "Quizymode is a free study app with quizzes, flashcards, five games and notes-to-quiz. Try five questions with no account, or see how it was built."
    );
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(ABOUT_CANONICAL);
    expect(ABOUT_CANONICAL).toBe("https://www.quizymode.com/about");
    const llms = fs.readFileSync(path.join(process.cwd(), "public", "llms.txt"), "utf8");
    const aboutLines = llms.split(/\r?\n/).filter((line) => /^- \[About\]\(https:\/\/www\.quizymode\.com\/about\):/.test(line));
    expect(aboutLines).toHaveLength(1);
    expect(aboutLines[0]).toMatch(/how one engineer builds it/);
  });

  it("AC 3.0.51 About stays a lazy route and its sources import no new runtime dependency", () => {
    const app = fs.readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");
    expect(app).toContain('lazyPage(() => import("./features/about/pages/AboutPage"))');
    expect(app).not.toMatch(/^import AboutPage/m);
    const aboutDir = path.join(process.cwd(), "src", "features", "about");
    const files = fs
      .readdirSync(aboutDir, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
    const allowed = new Set(["react", "react-router-dom", "@tanstack/react-query", "@heroicons/react"]);
    for (const file of files) {
      const source = fs.readFileSync(path.join(aboutDir, file), "utf8");
      for (const [, spec] of source.matchAll(/from "([^"]+)"/g)) {
        if (spec.startsWith(".") || spec.startsWith("@/")) continue;
        const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        expect(allowed, `${file} imports ${spec}`).toContain(pkg);
      }
    }
  });

  it("AC 3.0.58 each loaded collection card links to its page and shows the API count; a failed one hides only its card", async () => {
    getById.mockImplementation((id: string) =>
      id === SOUNDS_FAKE_ID ? Promise.reject(new Error("404")) : Promise.resolve(COLLECTIONS[id])
    );
    renderAbout();
    const explore = screen.getByRole("region", { name: SECTION_HEADINGS[4] });
    await waitFor(() => expect(within(explore).getAllByTestId("about-collection-card")).toHaveLength(2));
    const cards = within(explore).getAllByTestId("about-collection-card");
    expect(cards.map((card) => card.getAttribute("data-collection-id"))).toEqual([AHA_ID, LANDMARKS_ID]);
    expect(within(cards[0]).getByRole("link", { name: "Aha Moment Trivia" })).toHaveAttribute("href", `/collections/${AHA_ID}`);
    expect(cards[0]).toHaveTextContent("33 questions");
    expect(cards[0]).toHaveTextContent("Clue-driven trivia.");
    expect(within(cards[1]).getByRole("link", { name: "Landmarks from Sideways Clues" })).toHaveAttribute(
      "href",
      `/collections/${LANDMARKS_ID}`
    );
    expect(cards[1]).toHaveTextContent("12 questions");
    expect(within(explore).queryByText("Sounds Fake, But It's True")).not.toBeInTheDocument();
    expect(within(explore).getByRole("link", { name: "All featured sets" })).toHaveAttribute("href", "/featured");
    expect(getById.mock.calls.map(([id]) => id)).toEqual(expect.arrayContaining([AHA_ID, SOUNDS_FAKE_ID, LANDMARKS_ID]));
  });

  it("AC 3.0.59 a collection response without a count renders its card without a count", async () => {
    getById.mockImplementation((id: string) => {
      const withoutCount: Partial<CollectionResponse> = { ...COLLECTIONS[id] };
      delete withoutCount.itemCount;
      return Promise.resolve(withoutCount as CollectionResponse);
    });
    renderAbout();
    const cards = await screen.findAllByTestId("about-collection-card");
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(within(card).queryByTestId("about-collection-count")).not.toBeInTheDocument();
      expect(card.textContent ?? "").not.toMatch(/\d+\s+questions?/);
    }
  });

  it("AC 3.0.60 every About image is a WebP file under public/about of at most 100 KB, with width, height, alt and lazy loading", () => {
    const container = renderAbout();
    const files = fs.readdirSync(PUBLIC_ABOUT_DIR);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(file, file).toMatch(/\.webp$/);
      const bytes = fs.readFileSync(path.join(PUBLIC_ABOUT_DIR, file));
      expect(bytes.subarray(0, 4).toString("ascii"), file).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii"), file).toBe("WEBP");
      expect(bytes.length, `${file} size`).toBeLessThanOrEqual(100 * 1024);
    }
    const images = Array.from(container.querySelectorAll("img"));
    expect(images.length).toBeGreaterThan(0);
    const used = new Set<string>();
    for (const img of images) {
      const src = img.getAttribute("src") ?? "";
      expect(src, src).toMatch(/^\/about\/[a-z0-9-]+\.webp$/);
      expect(fs.existsSync(path.join(PUBLIC_ABOUT_DIR, src.slice("/about/".length))), src).toBe(true);
      expect(Number(img.getAttribute("width")), `${src} width`).toBeGreaterThan(0);
      expect(Number(img.getAttribute("height")), `${src} height`).toBeGreaterThan(0);
      expect((img.getAttribute("alt") ?? "").trim(), `${src} alt`).not.toBe("");
      expect(img.getAttribute("alt") ?? "", `${src} alt`).not.toMatch(/screenshot/i);
      // No image sits above the fold (the Hero and the hook question come first), so every one loads lazily.
      expect(img, src).toHaveAttribute("loading", "lazy");
      used.add(src.slice("/about/".length));
    }
    expect([...used].sort()).toEqual([...files].sort());
  });

  it("AC 3.0.61 every image src on the About page is a same-origin path", () => {
    const container = renderAbout();
    const images = Array.from(container.querySelectorAll("img"));
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      const src = img.getAttribute("src") ?? "";
      expect(src, src).toMatch(/^\/(?!\/)/);
      expect(new URL(src, window.location.origin).origin, src).toBe(window.location.origin);
    }
  });

  it("AC 3.0.62 the notes section shows three numbered steps in order, each with its image; step 1 names Photos or scan", () => {
    renderAbout();
    const notes = screen.getByRole("region", { name: SECTION_HEADINGS[2] });
    const list = within(notes).getByTestId("about-notes-steps");
    expect(list.tagName).toBe("OL");
    expect(list).toHaveClass("list-decimal");
    const steps = within(list).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "Add your notes.",
      "Pick the sections that matter.",
      "Keep the good questions, bin the rest.",
    ]);
    const images = steps.map((step) => within(step).getByRole("img"));
    expect(images.map((img) => img.getAttribute("src"))).toEqual([
      "/about/notes-add.webp",
      "/about/notes-sections.webp",
      "/about/notes-review.webp",
    ]);
    expect(images[0]).toHaveAccessibleName(expect.stringContaining("Photos or scan"));
    expect(images[2]).toHaveAccessibleName(expect.stringContaining("quote"));
  });
});
