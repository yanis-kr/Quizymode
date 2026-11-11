import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TopicMember } from "@/api/collections";
import { TopicMembersSection } from "./TopicMembersSection";

function topic(overrides: Partial<TopicMember> = {}): TopicMember {
  return {
    id: "t-1",
    categoryId: "c-1",
    keyword1Id: "k-1",
    keyword2Id: null,
    categoryName: "Quiz",
    keyword1Name: "Cloud",
    keyword2Name: null,
    isRemoved: false,
    visibleItemCount: 12,
    exceedsWarningThreshold: false,
    addedAt: "2026-11-10T10:00:00Z",
    ...overrides,
  };
}

describe("TopicMembersSection", () => {
  it("renders nothing when there are no topic members", () => {
    const { container } = render(<TopicMembersSection topics={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the section Topics and labels the Live pill as updating automatically", () => {
    render(<TopicMembersSection topics={[topic()]} />);

    expect(screen.getByRole("heading", { name: "Topics" })).toBeInTheDocument();
    const section = screen.getByRole("region", { name: "Topics" });
    expect(within(section).getByText("Quiz / Cloud")).toBeInTheDocument();
    expect(within(section).getByText("Live", { exact: false })).toHaveTextContent("updates automatically");
    expect(within(section).getByText("12 questions you can see")).toBeInTheDocument();
  });

  it("flags a removed topic and shows no questions", () => {
    render(<TopicMembersSection topics={[topic({ isRemoved: true, visibleItemCount: 0 })]} />);

    expect(screen.getByText("Removed topic")).toBeInTheDocument();
    expect(screen.getByText("No questions")).toBeInTheDocument();
  });

  it("shows a nonblocking notice above 500 visible questions and never hides the topic", () => {
    render(<TopicMembersSection topics={[topic({ visibleItemCount: 501, exceedsWarningThreshold: true })]} />);

    expect(screen.getByRole("note")).toHaveTextContent("More than 500 questions");
    expect(screen.getByText("501 questions you can see")).toBeInTheDocument();
  });

  it("orders topics by when they were added, oldest first", () => {
    render(
      <TopicMembersSection
        topics={[
          topic({ id: "later", keyword1Name: "Later", addedAt: "2026-11-11T10:00:00Z" }),
          topic({ id: "first", keyword1Name: "First", addedAt: "2026-11-09T10:00:00Z" }),
        ]}
      />
    );

    const labels = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(labels[0]).toContain("First");
    expect(labels[1]).toContain("Later");
  });
});
