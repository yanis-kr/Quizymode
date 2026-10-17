import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContentScopeTables, FeatureAreaTable } from "./PagesBreakdown";

describe("PagesBreakdown", () => {
  it("shows sessions, hits, and share of sessions per feature area", () => {
    render(
      <FeatureAreaTable
        rows={[
          { area: "quiz", hits: 40, sessions: 12, sessionSharePercent: 60, itemSteps: 30 },
          { area: "flashcards", hits: 10, sessions: 4, sessionSharePercent: 20, itemSteps: 8 },
          { area: "other", hits: 2, sessions: 1, sessionSharePercent: 5, itemSteps: 0 },
        ]}
      />
    );

    expect(screen.getByText("Quiz")).toBeInTheDocument();
    expect(screen.getByText("Flashcards")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
  });

  it("lists categories, navigation sets, and named collections with item steps", () => {
    render(
      <ContentScopeTables
        scopes={{
          topCategories: [
            { key: "geography", name: null, sessions: 5, hits: 20, itemSteps: 15, avgItemStepsPerSession: 3 },
          ],
          topNavPaths: [
            { key: "geography/capitals", name: null, sessions: 2, hits: 9, itemSteps: 7, avgItemStepsPerSession: 3.5 },
          ],
          topCollections: [
            { key: "c-1", name: "World Capitals", sessions: 1, hits: 4, itemSteps: 3, avgItemStepsPerSession: 3 },
            { key: "c-2", name: null, sessions: 1, hits: 1, itemSteps: 0, avgItemStepsPerSession: 0 },
          ],
        }}
      />
    );

    expect(screen.getByText("geography")).toBeInTheDocument();
    expect(screen.getByText("geography/capitals")).toBeInTheDocument();
    expect(screen.getByText("3.5")).toBeInTheDocument();
    expect(screen.getByText("World Capitals")).toBeInTheDocument();
    expect(screen.getByText("Unknown collection")).toBeInTheDocument();
  });

  it("shows an empty state when no hits matched", () => {
    render(<FeatureAreaTable rows={[]} />);

    expect(screen.getByText("No page hits matched the current filters.")).toBeInTheDocument();
  });
});
