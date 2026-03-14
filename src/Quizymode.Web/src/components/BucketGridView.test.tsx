import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BucketGridView } from "./BucketGridView";

const mockBuckets = [
  {
    id: "cat-1",
    label: "Category One",
    itemCount: 10,
    description: "First category",
    averageRating: 4.2,
    isPrivate: false,
  },
  {
    id: "cat-2",
    label: "Category Two",
    itemCount: 5,
    averageRating: null,
    isPrivate: true,
  },
];

describe("BucketGridView", () => {
  it("renders all buckets with labels and item counts", () => {
    render(
      <BucketGridView buckets={mockBuckets} onOpenBucket={() => {}} />
    );
    expect(screen.getByText("Category One")).toBeInTheDocument();
    expect(screen.getByText("10 items")).toBeInTheDocument();
    expect(screen.getByText("Category Two")).toBeInTheDocument();
    expect(screen.getByText("5 items")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <BucketGridView buckets={mockBuckets} onOpenBucket={() => {}} />
    );
    expect(screen.getByText("First category")).toBeInTheDocument();
  });

  it("renders Public/Private badge when isPrivate is defined", () => {
    render(
      <BucketGridView buckets={mockBuckets} onOpenBucket={() => {}} />
    );
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
  });

  it("calls onOpenBucket with bucket when a card is clicked", async () => {
    const user = userEvent.setup({ delay: null });
    const onOpenBucket = vi.fn();
    render(
      <BucketGridView buckets={mockBuckets} onOpenBucket={onOpenBucket} />
    );
    await user.click(screen.getByRole("button", { name: /Category One/ }));
    expect(onOpenBucket).toHaveBeenCalledWith(mockBuckets[0]);
  });

  it("renders empty when buckets array is empty", () => {
    const { container } = render(
      <BucketGridView buckets={[]} onOpenBucket={() => {}} />
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid?.childNodes.length).toBe(0);
  });
});
