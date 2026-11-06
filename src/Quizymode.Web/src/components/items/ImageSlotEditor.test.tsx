import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mediaApi, type ImageSlotInput } from "@/api/media";
import { ImageSlotEditor } from "./ImageSlotEditor";
vi.mock("@/api/media", () => ({ mediaApi: { upload: vi.fn(), preview: vi.fn() }, mediaUploadErrorMessage: () => "Connection failed. Retry." }));
function Harness() {
  const [value, setValue] = useState<{ question: string; image?: ImageSlotInput }>({ question: "Original" }); const [busy, setBusy] = useState(false);
  return <><label>Question text<input value={value.question} onChange={e => setValue({ ...value, question: e.target.value })} /></label><ImageSlotEditor label="Question picture" value={value.image} onChange={image => setValue({ ...value, image })} onBusy={setBusy} /><button disabled={busy}>Save</button><output>{value.image?.assetId}</output></>;
}
describe("Normalized authoring state", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:normalized"), revokeObjectURL: vi.fn() }); });
  it("keeps edits made during upload and previews only normalized server bytes", async () => {
    let finish!: (value: Awaited<ReturnType<typeof mediaApi.upload>>) => void;
    vi.mocked(mediaApi.upload).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const normalized = new Blob(["normalized"], { type: "image/webp" }); vi.mocked(mediaApi.preview).mockResolvedValue(normalized);
    const user = userEvent.setup(); render(<Harness />);
    await user.click(screen.getByRole("checkbox")); await user.upload(screen.getByLabelText(/Choose or replace/), new File(["source"], "private-name.png", { type: "image/png" }));
    expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    const question = screen.getByLabelText("Question text"); await user.clear(question); await user.type(question, "Edited while uploading");
    await act(async () => finish({ id: "asset-1", state: "Ready", width: 100, height: 50, bytes: 42, sha256: "hash" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledWith(normalized));
    expect(question).toHaveValue("Edited while uploading"); expect(screen.getByText("asset-1")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private-name.png");
  });
  it("requires Retry or Cancel after failure, preserving form text", async () => {
    vi.mocked(mediaApi.upload).mockRejectedValue(new Error("offline")); const user = userEvent.setup(); render(<Harness />);
    await user.click(screen.getByRole("checkbox")); await user.upload(screen.getByLabelText(/Choose or replace/), new File(["source"], "image.png", { type: "image/png" }));
    await screen.findByText("Connection failed. Retry."); expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel upload" })); expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(); expect(screen.getByLabelText("Question text")).toHaveValue("Original");
  });
});
