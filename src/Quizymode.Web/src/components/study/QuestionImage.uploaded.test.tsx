import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { mediaApi } from "@/api/media";
import { MediaIdentityContext } from "@/contexts/MediaIdentityContext";
import { QuestionImage } from "./QuestionImage";
vi.mock("@/api/media", () => ({ mediaApi: { content: vi.fn() } }));
const uploaded = { key: "media:11111111111111111111111111111111", altText: "Graph", revision: 1, longDescription: "Line rises from zero." };
describe("Uploaded item-bound picture grants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:normalized"), revokeObjectURL: vi.fn() }); });
  it("uses explicit collection authorization and never retries denied content through a direct or asset route", async () => {
    vi.mocked(mediaApi.content).mockRejectedValue(new Error("404"));
    render(<MemoryRouter><QuestionImage image={uploaded} itemId="item-1" collectionId="share-1" /></MemoryRouter>);
    await screen.findByText("Picture couldn't load");
    expect(mediaApi.content).toHaveBeenCalledTimes(1);
    expect(mediaApi.content).toHaveBeenCalledWith("item-1", "question", "share-1", expect.any(AbortSignal), 1);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
  it("revokes grants across identity/revision changes and discards a late old fetch", async () => {
    let resolveOld!: (blob: Blob) => void;
    vi.mocked(mediaApi.content).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(new Blob(["normalized"], { type: "image/webp" }));
    const view = (identity: string, revision: number) => <MemoryRouter><MediaIdentityContext.Provider value={identity}><QuestionImage image={{ ...uploaded, revision }} itemId="item-1" collectionId="share-1" /></MediaIdentityContext.Provider></MemoryRouter>;
    const { rerender, unmount } = render(view("owner", 1));
    const signal = vi.mocked(mediaApi.content).mock.calls[0][3];
    rerender(view("guest", 2));
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "blob:normalized"));
    expect(signal.aborted).toBe(true);
    await act(async () => resolveOld(new Blob(["old-private"])));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    fireEvent.load(screen.getByRole("img"));
    expect(screen.getByText("Line rises from zero.")).toBeInTheDocument();
    unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:normalized");
  });
  it.each([undefined, 0, -1])("fails closed without a positive DTO revision (%s)", async revision => {
    render(<MemoryRouter><QuestionImage image={{ ...uploaded, revision }} itemId="item-1" /></MemoryRouter>);
    expect(screen.getByText("Picture isn't available")).toBeInTheDocument(); expect(mediaApi.content).not.toHaveBeenCalled();
  });
  it("offers keyboard unscored Skip only while the picture is loading, never once it is displayed (AC 3.166.2)", async () => {
    const onSkip = vi.fn(); vi.mocked(mediaApi.content).mockResolvedValue(new Blob(["normalized"]));
    render(<MemoryRouter><QuestionImage image={uploaded} itemId="item-1" onSkip={onSkip} /></MemoryRouter>);
    const skip = screen.getByRole("button", { name: "Skip question (not scored)" }); skip.focus();
    await userEvent.keyboard("{Enter}"); expect(onSkip).toHaveBeenCalledOnce();
    fireEvent.load(await screen.findByRole("img"));
    expect(screen.queryByRole("button", { name: "Skip question (not scored)" })).not.toBeInTheDocument();
  });
  it("offers Skip when the picture failed to load", async () => {
    vi.mocked(mediaApi.content).mockRejectedValue(new Error("404"));
    render(<MemoryRouter><QuestionImage image={uploaded} itemId="item-1" onSkip={vi.fn()} /></MemoryRouter>);
    await screen.findByText("Picture couldn't load");
    expect(screen.getAllByRole("button", { name: "Skip question (not scored)" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Retry loading picture" })).toBeInTheDocument();
  });
  it("says a withdrawn picture was withdrawn, with no Retry, no fetch and no report link (AC 3.166.3)", () => {
    render(<MemoryRouter><QuestionImage image={uploaded} itemId="item-1" withdrawn onSkip={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText("This picture was withdrawn")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry loading picture" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Report picture" })).not.toBeInTheDocument();
    expect(mediaApi.content).not.toHaveBeenCalled();
  });
  it("keeps the zoom button over the picture and the Report picture link below it so they cannot overlap (AC 3.166.1)", async () => {
    vi.mocked(mediaApi.content).mockResolvedValue(new Blob(["normalized"]));
    render(<MemoryRouter><QuestionImage image={uploaded} itemId="item-1" /></MemoryRouter>);
    fireEvent.load(await screen.findByRole("img"));
    const zoom = screen.getByRole("button", { name: "Enlarge picture" });
    const report = screen.getByRole("button", { name: "Report picture" });
    expect(zoom.parentElement).toContainElement(screen.getByTestId("question-image"));
    expect(zoom.parentElement).not.toContainElement(report);
  });
});
