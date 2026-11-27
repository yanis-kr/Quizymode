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
    expect(screen.getByText("10 questions")).toBeInTheDocument();
    expect(screen.getByText("Category Two")).toBeInTheDocument();
    expect(screen.getByText("5 questions")).toBeInTheDocument();
  });

  it("AC 3.4.12 says 1 question and N questions on the tiles, with and without a picture (#922)", () => {
    render(
      <BucketGridView
        buckets={[
          { id: "one", label: "one", itemCount: 1 },
          { id: "two", label: "two", itemCount: 2, backgroundImage: "/images/theme.png" },
          { id: "single", label: "single", itemCount: 1, backgroundImage: "/images/theme.png" },
        ]}
        onOpenBucket={() => {}}
      />
    );
    expect(screen.getAllByText("1 question")).toHaveLength(2);
    expect(screen.getByText("2 questions")).toBeInTheDocument();
    expect(screen.queryByText(/\bitems?\b/)).not.toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <BucketGridView buckets={mockBuckets} onOpenBucket={() => {}} />
    );
    expect(screen.getByText("First category")).toBeInTheDocument();
  });

  it.each([undefined, "/images/theme.png"])(
    "AC 3.4.7 shows the name once when the description repeats it (background %s)",
    (backgroundImage) => {
      render(
        <BucketGridView
          buckets={[
            { id: "capitals", label: "capitals", itemCount: 3, description: " Capitals ", backgroundImage },
            { id: "flags", label: "flags", itemCount: 4, description: "Flags of the world", backgroundImage },
          ]}
          onOpenBucket={() => {}}
        />
      );
      expect(screen.getAllByText(/capitals/i)).toHaveLength(1);
      expect(screen.getByRole("button", { name: /capitals/ })).not.toHaveAttribute("title");
      expect(screen.getByText("Flags of the world")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /flags/ })).toHaveAttribute("title", "Flags of the world");
    }
  );

  it("renders Private badge when a bucket is private", () => {
    render(
      <BucketGridView buckets={mockBuckets} onOpenBucket={() => {}} />
    );
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
