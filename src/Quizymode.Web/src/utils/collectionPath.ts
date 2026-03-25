export function collectionNameToSlug(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "+");

  return normalized || "collection";
}

export function buildCollectionPath(
  collectionId: string,
  collectionName?: string | null
): string {
  const slug = collectionName ? collectionNameToSlug(collectionName) : "";
  return slug
    ? `/collections/${collectionId}/${slug}`
    : `/collections/${collectionId}`;
}

export function buildCollectionStudyPath(
  mode: "explore" | "quiz",
  collectionId: string,
  collectionName?: string | null,
  itemId?: string | null
): string {
  const slug = collectionName ? `/${collectionNameToSlug(collectionName)}` : "";
  const itemSegment = itemId ? `/item/${itemId}` : "";
  return `/${mode}/collections/${collectionId}${slug}${itemSegment}`;
}
