import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import type { ItemResponse } from "@/types/api";

export function testItem(id: string, question = `Question ${id}`): ItemResponse {
  return {
    id,
    category: "trivia",
    isPrivate: false,
    question,
    correctAnswer: `Right ${id}`,
    incorrectAnswers: [`Wrong ${id}`],
    explanation: "",
    createdAt: "2026-10-01T00:00:00Z",
    keywords: [],
    collections: [],
  };
}

export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrap = (node: ReactElement) => (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{node}</MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
  const view = render(wrap(ui));
  // Re-renders inside the same providers (for example after the mocked auth state changes).
  return { ...view, rerender: (next: ReactElement) => view.rerender(wrap(next)) };
}
