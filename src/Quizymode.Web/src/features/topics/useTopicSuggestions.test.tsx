import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AxiosError, AxiosHeaders } from "axios";
import { taxonomyApi, type TopicSuggestion } from "@/api/taxonomy";
import {
  MIN_SUGGEST_TEXT_LENGTH,
  RATE_LIMIT_SUPPRESS_MS,
  resetTopicSuggestionSuppression,
  SUGGEST_DEBOUNCE_MS,
  textKey,
  useTopicSuggestions,
} from "./useTopicSuggestions";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userId: "user-1" }),
}));

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: { getAll: vi.fn(), suggest: vi.fn() },
}));

const chip = (l2: string, reason: TopicSuggestion["reason"] = "text"): TopicSuggestion => ({
  categorySlug: "tech",
  l1: "ai-ml",
  l2,
  path: `tech › ai-ml › ${l2}`,
  description: "",
  score: 0.5,
  matchedTerms: [],
  reason,
});

const LONG = "Neural networks learn weights with backpropagation and gradient descent";

function httpError(status: number): AxiosError {
  return new AxiosError("failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    statusText: "x",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {},
  });
}

function setup(initial: { text: string; enabled: boolean }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook((props: { text: string; enabled: boolean }) => useTopicSuggestions(props), {
    wrapper,
    initialProps: initial,
  });
}

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe("useTopicSuggestions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    resetTopicSuggestionSuppression();
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [chip("common", "popular")] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks for the fallback once on mount with empty text and shows the initial phase until it arrives", async () => {
    // AC 12.10
    const { result } = setup({ text: "", enabled: true });
    expect(result.current.phase).toBe("initial");

    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(taxonomyApi.suggest).toHaveBeenCalledTimes(1);
    expect(vi.mocked(taxonomyApi.suggest).mock.calls[0][0]).toBe("");
    expect(vi.mocked(taxonomyApi.suggest).mock.calls[0][1]).toMatchObject({ limit: 5 });
    expect(result.current.suggestions.map((s) => s.l2)).toEqual(["common"]);
  });

  it("makes no request before the 600 ms pause and one request after it", async () => {
    // AC 12.10
    const { result, rerender } = setup({ text: "", enabled: true });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    vi.mocked(taxonomyApi.suggest).mockClear();
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [chip("deep-learning")] });

    rerender({ text: LONG, enabled: true });
    await advance(SUGGEST_DEBOUNCE_MS - 50);
    expect(taxonomyApi.suggest).not.toHaveBeenCalled();

    await advance(100);
    await waitFor(() => expect(taxonomyApi.suggest).toHaveBeenCalledTimes(1));
    expect(vi.mocked(taxonomyApi.suggest).mock.calls[0][0]).toBe(LONG);
    await waitFor(() => expect(result.current.suggestions.map((s) => s.l2)).toEqual(["deep-learning"]));
  });

  it("sends one request when the user keeps typing", async () => {
    const { result, rerender } = setup({ text: "", enabled: true });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    vi.mocked(taxonomyApi.suggest).mockClear();

    let text = "";
    for (const word of LONG.split(" ")) {
      text = `${text} ${word}`.trim();
      rerender({ text, enabled: true });
      await advance(200);
    }
    expect(taxonomyApi.suggest).not.toHaveBeenCalled();

    await advance(SUGGEST_DEBOUNCE_MS);
    await waitFor(() => expect(taxonomyApi.suggest).toHaveBeenCalledTimes(1));
    expect(vi.mocked(taxonomyApi.suggest).mock.calls[0][0]).toBe(LONG);
  });

  it("makes no new request for unchanged text", async () => {
    const { result, rerender } = setup({ text: LONG, enabled: true });
    await advance(SUGGEST_DEBOUNCE_MS + 50);
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    const calls = vi.mocked(taxonomyApi.suggest).mock.calls.length;

    rerender({ text: `  ${LONG}  `, enabled: true });
    await advance(SUGGEST_DEBOUNCE_MS * 3);
    expect(vi.mocked(taxonomyApi.suggest).mock.calls.length).toBe(calls);
  });

  it("makes no request below 20 characters and keeps the chips already shown", async () => {
    // AC 12.10
    const { result, rerender } = setup({ text: "", enabled: true });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    vi.mocked(taxonomyApi.suggest).mockClear();

    const short = "x".repeat(MIN_SUGGEST_TEXT_LENGTH - 1);
    rerender({ text: short, enabled: true });
    await advance(SUGGEST_DEBOUNCE_MS * 3);

    expect(taxonomyApi.suggest).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("ready");
    expect(result.current.suggestions).toHaveLength(1);
  });

  it("returns to the cached fallback when the text is cleared, without a new request", async () => {
    const { result, rerender } = setup({ text: "", enabled: true });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    rerender({ text: LONG, enabled: true });
    await advance(SUGGEST_DEBOUNCE_MS + 50);
    await waitFor(() => expect(taxonomyApi.suggest).toHaveBeenCalledTimes(2));

    rerender({ text: "", enabled: true });
    await advance(SUGGEST_DEBOUNCE_MS + 50);
    expect(taxonomyApi.suggest).toHaveBeenCalledTimes(2);
    expect(result.current.suggestions.map((s) => s.reason)).toEqual(["popular"]);
  });

  it("hides the chips on a 500 without throwing or retrying", async () => {
    // AC 12.16
    vi.mocked(taxonomyApi.suggest).mockRejectedValue(httpError(500));
    const { result } = setup({ text: "", enabled: true });

    await waitFor(() => expect(taxonomyApi.suggest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.phase).toBe("hidden"));
    await advance(5000);
    expect(taxonomyApi.suggest).toHaveBeenCalledTimes(1);
    expect(result.current.suggestions).toEqual([]);
  });

  it("hides the chips on a 429 and sends no request for 60 seconds afterwards", async () => {
    // AC 12.16
    vi.mocked(taxonomyApi.suggest).mockRejectedValueOnce(httpError(429));
    const { result, rerender } = setup({ text: "", enabled: true });
    await waitFor(() => expect(result.current.phase).toBe("hidden"));
    expect(taxonomyApi.suggest).toHaveBeenCalledTimes(1);

    rerender({ text: LONG, enabled: true });
    await advance(SUGGEST_DEBOUNCE_MS + 50);
    expect(taxonomyApi.suggest).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.phase).toBe("hidden"));

    await advance(RATE_LIMIT_SUPPRESS_MS);
    rerender({ text: `${LONG} and more words`, enabled: true });
    await advance(SUGGEST_DEBOUNCE_MS + 50);
    await waitFor(() => expect(taxonomyApi.suggest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.phase).toBe("ready"));
  });

  it("makes no request while disabled and discards what a late response brings", async () => {
    // AC 12.13
    const { result } = setup({ text: LONG, enabled: false });
    await advance(SUGGEST_DEBOUNCE_MS * 3);

    expect(taxonomyApi.suggest).not.toHaveBeenCalled();
    expect(result.current).toEqual({ suggestions: [], phase: "hidden", isRefreshing: false });
  });

  it("serves the same text from the cache after being re-enabled", async () => {
    // AC 12.13: removing the pill brings the chips back without a new request.
    const { result, rerender } = setup({ text: LONG, enabled: true });
    await advance(SUGGEST_DEBOUNCE_MS + 50);
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    const calls = vi.mocked(taxonomyApi.suggest).mock.calls.length;

    rerender({ text: LONG, enabled: false });
    expect(result.current.phase).toBe("hidden");
    rerender({ text: LONG, enabled: true });
    await advance(SUGGEST_DEBOUNCE_MS * 2);

    expect(result.current.phase).toBe("ready");
    expect(vi.mocked(taxonomyApi.suggest).mock.calls.length).toBe(calls);
  });
});

describe("textKey", () => {
  it("is stable, distinguishes texts and never contains the text", () => {
    expect(textKey("abc")).toBe(textKey("abc"));
    expect(textKey("abc")).not.toBe(textKey("abd"));
    expect(textKey("zzqxv secret")).not.toContain("secret");
  });
});
