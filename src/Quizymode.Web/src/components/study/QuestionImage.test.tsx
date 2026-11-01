import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionImage } from "./QuestionImage";

vi.mock("@/media/curatedImages", () => ({
  resolveCuratedImage: (key: string) => (key === "curated:flags/fr" ? "/assets/m/fr.webp" : null),
}));

const image = { key: "curated:flags/fr", altText: "Three vertical bands: blue, white, red" };

describe("QuestionImage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing without an image", () => {
    const { container } = render(<QuestionImage image={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses the altText as the img alt, never shows it as a caption and sets no title", () => {
    render(<QuestionImage image={image} />);
    const img = screen.getByAltText(image.altText);
    expect(img).toHaveAttribute("src", "/assets/m/fr.webp");
    expect(img).not.toHaveAttribute("title");
    expect(img).toHaveAttribute("loading", "eager");
    expect(screen.queryByText(image.altText)).not.toBeInTheDocument();
  });

  it("is busy with a status message until the picture loads", () => {
    render(<QuestionImage image={image} />);
    expect(screen.getByTestId("question-image")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading picture");

    fireEvent.load(screen.getByAltText(image.altText));

    expect(screen.getByTestId("question-image")).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByText("Loading picture")).not.toBeInTheDocument();
  });

  it("shows an error with Retry when the picture fails, and Retry remounts the image and focuses the box", async () => {
    const user = userEvent.setup();
    render(<QuestionImage image={image} />);
    const first = screen.getByAltText(image.altText);
    fireEvent.error(first);

    expect(screen.getByText("Picture couldn't load")).toBeInTheDocument();
    expect(screen.queryByAltText(image.altText)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry loading picture" }));

    const second = screen.getByAltText(image.altText);
    expect(second).not.toBe(first);
    expect(second).toHaveAttribute("src", "/assets/m/fr.webp?r=1");
    expect(screen.getByTestId("question-image")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("question-image")).toHaveFocus();
  });

  it("explains an unknown key without a Retry button", () => {
    render(<QuestionImage image={{ key: "curated:flags/zz", altText: "Something" }} />);
    expect(screen.getByText("Picture isn't available")).toBeInTheDocument();
    expect(screen.queryByTestId("question-image-retry")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("never renders a hostile key as an image source", () => {
    render(<QuestionImage image={{ key: "https://evil/x.webp", altText: "Evil" }} />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("Picture isn't available")).toBeInTheDocument();
  });

  it("renders thumbnails lazily and with icon-only errors", () => {
    render(<QuestionImage image={image} size="sm" />);
    const img = screen.getByAltText(image.altText);
    expect(img).toHaveAttribute("loading", "lazy");
    expect(screen.queryByText("Loading picture")).not.toBeInTheDocument();

    fireEvent.error(img);

    expect(screen.getByRole("img", { name: "Picture couldn't load" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is not interactive: no zoom or click target", () => {
    render(<QuestionImage image={image} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
