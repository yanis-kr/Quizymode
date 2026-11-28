/** Create, feedback, sign-up prompt, roadmap and My items screens say questions, not items or sets (#924). */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import type { ReactElement } from "react";
import { ActiveCollectionNotice } from "@/components/items/ActiveCollectionNotice";
import { MyItemsActions } from "@/features/items/components/MyItemsActions";
import FeedbackPage from "@/features/feedback/pages/FeedbackPage";
import { feedbackTypeMap, feedbackTypeOptions } from "@/features/feedback/feedbackTypes";
import RoadmapPage from "@/features/roadmap/pages/RoadmapPage";
import { SIGNUP_PROMPT_COPY } from "@/features/auth/utils/signupPrompt";
import { findPictureImportError } from "@/features/items/utils/pictureImport";
import llms from "../../public/llms.txt?raw";

const collection = vi.hoisted(() => ({ isPublic: false }));

vi.mock("@/hooks/useActiveCollection", () => ({
  useActiveCollection: () => ({ activeCollection: { id: "c1", name: "Biology", isPublic: collection.isPublic } }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAuthenticated: false, email: null }) }));
vi.mock("@/features/feedback/components/FeedbackDialog", () => ({ default: () => null }));

const OLD_WORDS = /\b(item|items|sets)\b/i;

function renderInApp(element: ReactElement) {
  return render(
    <HelmetProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>{element}</MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

/** Visible text plus the attributes that give elements their accessible names. */
function wording(): string[] {
  const attributes = Array.from(document.body.querySelectorAll("*")).flatMap((element) =>
    ["aria-label", "title", "placeholder", "alt"].map((name) => element.getAttribute(name) ?? "")
  );
  return [document.body.textContent ?? "", ...attributes];
}

const expectNoOldWords = (texts: string[]) => expect(texts.filter((text) => OLD_WORDS.test(text))).toEqual([]);

describe("Questions wording (#924)", () => {
  it.each([false, true])("the active collection notice speaks of questions (public: %s)", (isPublic) => {
    collection.isPublic = isPublic;
    renderInApp(<ActiveCollectionNotice />);

    expect(document.body).toHaveTextContent("New questions will be added to your active collection");
    expect(document.body).toHaveTextContent("questions will be accessible via its shareable link");
    expectNoOldWords(wording());
  });

  it("the feedback page and its request type ask for more questions", () => {
    renderInApp(<FeedbackPage />);

    expect(screen.getByRole("heading", { name: "Ask for more questions" })).toBeInTheDocument();
    expect(feedbackTypeMap.requestItems).toMatchObject({
      label: "Ask for more questions",
      helperText: "Request missing topics or study areas.",
      detailsLabel: "What questions should we add?",
    });
    expectNoOldWords([...wording(), ...feedbackTypeOptions.flatMap((option) => Object.values(option).filter((v) => v !== option.value))]);
  });

  it.each([
    [true, ["View question", "Update question", "Delete question"]],
    [false, ["View question", "Only admins can edit public questions", "Only admins can delete public questions"]],
  ])("the My items actions name a question (can edit: %s)", (canEditDelete, titles) => {
    renderInApp(
      <MyItemsActions item={{ id: "q1" } as never} canEditDelete={canEditDelete} onDelete={() => {}} onManageCollections={() => {}} />
    );

    for (const title of titles) expect(screen.getByTitle(title)).toBeInTheDocument();
    expectNoOldWords(wording());
  });

  it("the roadmap speaks of quiz collections", () => {
    renderInApp(<RoadmapPage />);

    expect(screen.getByText(/Community-shared quiz collections/)).toBeInTheDocument();
    expectNoOldWords(wording());
  });

  it("no sign-up prompt uses the old words", () => {
    expect(SIGNUP_PROMPT_COPY["create-content"]).toMatchObject({
      heading: "Create your own collections",
      body: "Create a free account to add private questions and collections.",
    });
    expectNoOldWords(Object.values(SIGNUP_PROMPT_COPY).flatMap((copy) => Object.values(copy)));
  });

  it("names one or several rejected questions in the import picture error", () => {
    const picture = { questionImage: "curated:flags/fr" };

    expect(findPictureImportError([picture])).toMatch(/^Question 1 has /);
    expect(findPictureImportError([picture, picture])).toMatch(/^Questions 1 and 2 have /);
  });

  it("llms.txt uses the new words", () => {
    expectNoOldWords([llms]);
  });
});
