import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import IdeaPager from "./IdeaPager";
import { getTotalPages } from "../ideaPaging";

describe("IdeaPager", () => {
  it("renders nothing when all ideas fit on one page", () => {
    const { container } = render(
      <IdeaPager page={1} pageSize={50} totalCount={50} onPageChange={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("disables Previous on the first page and pages forward", () => {
    const onPageChange = vi.fn();
    render(
      <IdeaPager page={1} pageSize={50} totalCount={120} onPageChange={onPageChange} />
    );

    expect(screen.getByText("Page 1 of 3 (120 ideas)")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("disables Next on the last page", () => {
    render(
      <IdeaPager page={3} pageSize={50} totalCount={120} onPageChange={vi.fn()} />
    );
    expect(
      (screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("keeps Previous available when the current page has emptied out", () => {
    const onPageChange = vi.fn();
    render(
      <IdeaPager page={2} pageSize={50} totalCount={50} onPageChange={onPageChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("computes at least one page", () => {
    expect(getTotalPages(0, 50)).toBe(1);
    expect(getTotalPages(101, 50)).toBe(3);
  });
});
