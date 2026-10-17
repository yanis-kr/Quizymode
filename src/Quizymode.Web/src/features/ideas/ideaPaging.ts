export function getTotalPages(totalCount: number, pageSize: number): number {
  if (pageSize <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(totalCount / pageSize));
}
