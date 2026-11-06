import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(mediaApi.content).toHaveBeenCalledWith("item-1", "question", "share-1", expect.any(AbortSignal));
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
});
