import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { commentsApi, type CommentResponse } from "@/api/comments";
import { getServerErrorMessage } from "@/utils/apiError";

export const COMMENTS_PAGE_SIZE = 50;

/** The comment list shared by the drawer and the comments page: newest first, older pages loaded on request. */
export function useItemComments(itemId: string | null | undefined) {
  const query = useInfiniteQuery({
    queryKey: ["comments", itemId, "list"],
    queryFn: ({ pageParam }) => commentsApi.getByItemId(itemId!, pageParam, COMMENTS_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.totalCount ? last.page + 1 : undefined,
    enabled: !!itemId,
  });

  // Offset paging shifts when comments arrive between two loads, so a later page can repeat one.
  const comments = useMemo(() => {
    const byId = new Map<string, CommentResponse>();
    for (const page of query.data?.pages ?? []) {
      for (const comment of page.comments) byId.set(comment.id, comment);
    }
    return [...byId.values()];
  }, [query.data]);

  return {
    comments,
    isLoading: query.isLoading,
    /** True only when there is nothing to show; later failures keep the loaded comments. */
    hasLoadError: !!query.error && !query.data,
    refetch: query.refetch,
    hasOlder: query.hasNextPage,
    loadOlder: () => void query.fetchNextPage(),
    isFetching: query.isFetching,
    isLoadingOlder: query.isFetchingNextPage,
    loadOlderError:
      query.isFetchNextPageError && !query.isFetching
        ? getServerErrorMessage(query.error, "Could not load older comments.")
        : null,
  };
}
