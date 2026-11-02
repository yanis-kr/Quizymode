import { useEffect } from "react";
import { resolveCuratedImage } from "@/media/curatedImages";
import type { ItemResponse } from "@/types/api";

/**
 * Warms the browser cache with the next question's picture so it is usually ready when the learner gets there (#403).
 * Only the question picture: explanation pictures are never preloaded because they can show the answer.
 */
export function usePreloadNextPicture(next: Pick<ItemResponse, "questionImage"> | null | undefined): void {
  const key = next?.questionImage?.key;
  useEffect(() => {
    if (!key || typeof Image === "undefined") return;
    const url = resolveCuratedImage(key);
    if (url) new Image().src = url;
  }, [key]);
}
