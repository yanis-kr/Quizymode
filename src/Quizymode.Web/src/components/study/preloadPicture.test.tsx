import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreloadNextPicture } from "./preloadPicture";

vi.mock("@/media/curatedImages", () => ({
  resolveCuratedImage: (key: string) => (key.startsWith("curated:") ? `/assets/m/${key.slice(8).replace("/", "-")}.webp` : null),
}));

// AC 3.21.11: only the next question's picture is preloaded (one Image per step); explanation pictures never are.
describe("usePreloadNextPicture (AC 3.21.11)", () => {
  const sources: string[] = [];
  const OriginalImage = globalThis.Image;

  beforeEach(() => {
    sources.length = 0;
    class FakeImage {
      set src(value: string) {
        sources.push(value);
      }
    }
    globalThis.Image = FakeImage as unknown as typeof Image;
  });
  afterEach(() => {
    globalThis.Image = OriginalImage;
  });

  it("preloads the next question picture with a single Image", () => {
    renderHook(() => usePreloadNextPicture({ questionImage: { key: "curated:flags/fr", altText: "flag" } }));
    expect(sources).toEqual(["/assets/m/flags-fr.webp"]);
  });

  it("does not preload again for the same picture key on re-render", () => {
    const next = { questionImage: { key: "curated:flags/fr", altText: "flag" } };
    const { rerender } = renderHook(({ item }) => usePreloadNextPicture(item), { initialProps: { item: next } });
    rerender({ item: { questionImage: { key: "curated:flags/fr", altText: "flag" } } });
    expect(sources).toHaveLength(1);
  });

  it("preloads nothing for a text-only next item, no next item, or an unknown key", () => {
    renderHook(() => usePreloadNextPicture({ questionImage: null }));
    renderHook(() => usePreloadNextPicture(null));
    renderHook(() => usePreloadNextPicture({ questionImage: { key: "unknown:x", altText: "x" } }));
    expect(sources).toEqual([]);
  });

  it("never reads an explanation picture: the hook accepts only the question image", () => {
    const item = { questionImage: null, explanationImage: { key: "curated:diagrams/vpc", altText: "d" } } as unknown as Parameters<typeof usePreloadNextPicture>[0];
    renderHook(() => usePreloadNextPicture(item));
    expect(sources).toEqual([]);
  });
});
