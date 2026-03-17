// API Response Types

export interface CategoryResponse {
  category: string;
  description: string | null;
  shortDescription: string | null;
  count: number;
  id: string;
  isPrivate: boolean;
  averageStars: number | null;
}

export interface CategoriesResponse {
  categories: CategoryResponse[];
}

/** Navigation keyword (rank-1/rank-2) with aggregates from GET /keywords */
export interface NavKeywordResponse {
  name: string;
  itemCount: number;
  averageRating: number | null;
  navigationRank: number;
  description?: string | null;
  /** When > 0, show a "Private" badge (e.g. yellow) on the keyword set. */
  privateItemCount?: number;
}

export interface KeywordsResponse {
  keywords: NavKeywordResponse[];
}

export interface KeywordResponse {
  id: string;
  name: string;
  isPrivate: boolean;
}

export interface ItemCollectionResponse {
  id: string;
  name: string;
  createdAt: string;
}

export interface ItemResponse {
  id: string;
  category: string;
  isPrivate: boolean;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  explanation: string;
  createdAt: string;
  createdBy?: string | null;
  keywords: KeywordResponse[];
  collections: ItemCollectionResponse[];
  source?: string | null;
  /** Navigation path for breadcrumbs, e.g. [rank1, rank2] or ["other"]. Use "other" in URLs; display as "Others". */
  navigationBreadcrumb?: string[];
  factualRisk?: number | null;
  reviewComments?: string | null;
}

export interface ItemsResponse {
  items: ItemResponse[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface RandomItemsResponse {
  items: ItemResponse[];
}

export interface CollectionResponse {
  id: string;
  name: string;
  description?: string | null;
  createdBy: string;
  createdAt: string;
  itemCount: number;
  isPublic?: boolean;
}

export interface CollectionsResponse {
  collections: CollectionResponse[];
}

/** Discover (public) collections - item includes bookmark state */
export interface CollectionDiscoverItem {
  id: string;
  name: string;
  description?: string | null;
  createdBy: string;
  createdAt: string;
  itemCount: number;
  isBookmarked: boolean;
}

export interface DiscoverCollectionsResponse {
  items: CollectionDiscoverItem[];
  totalCount: number;
}

export interface BookmarkItem {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  itemCount: number;
}

/** Collection rating: stats and current user's rating */
export interface CollectionRatingResponse {
  count: number;
  averageStars: number | null;
  myStars: number | null;
}

/** User who bookmarked a collection (owner view) */
export interface CollectionBookmarkerItem {
  userId: string;
  name: string | null;
  bookmarkedAt: string;
}

export interface CollectionBookmarkedByResponse {
  bookmarkedBy: CollectionBookmarkerItem[];
}

export interface ReviewResponse {
  id: string;
  itemId: string;
  reaction: string;
  comment: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ReviewsResponse {
  reviews: ReviewResponse[];
}

export interface RequestResponse {
  id: string;
  categoryId: string;
  description: string;
  createdBy: string;
  createdAt: string;
  status: string;
}

// Request Types

export interface KeywordRequest {
  name: string;
  isPrivate: boolean;
}

export interface CreateItemRequest {
  category: string;
  isPrivate: boolean;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  explanation: string;
  keywords?: KeywordRequest[];
  source?: string;
  uploadId?: string | null;
  factualRisk?: number | null;
  reviewComments?: string | null;
  readyForReview?: boolean | null;
}

export interface UpdateItemRequest {
  category?: string;
  isPrivate?: boolean;
  question?: string;
  correctAnswer?: string;
  incorrectAnswers?: string[];
  explanation?: string;
  keywords?: KeywordRequest[];
  source?: string;
  factualRisk?: number | null;
  reviewComments?: string | null;
  readyForReview?: boolean | null;
}

export interface CreateCollectionRequest {
  name: string;
  description?: string | null;
  isPublic?: boolean;
}

export interface UpdateCollectionRequest {
  name?: string;
  description?: string | null;
  isPublic?: boolean;
}

export interface AddItemToCollectionRequest {
  itemId: string;
}

export interface BulkAddItemsToCollectionRequest {
  itemIds: string[];
}

export interface BulkAddItemsToCollectionResponse {
  addedCount: number;
  skippedCount: number;
  addedItemIds: string[];
}

export interface CreateReviewRequest {
  itemId: string;
  reaction: "like" | "dislike" | "neutral";
  comment: string;
}

export interface UpdateReviewRequest {
  reaction?: "like" | "dislike" | "neutral";
  comment?: string;
}

export interface CreateRequestRequest {
  categoryId: string;
  description: string;
}

export interface BulkCreateItemsRequest {
  items: CreateItemRequest[];
}

export interface UserResponse {
  id: string;
  name: string | null;
  email: string | null;
  isAdmin: boolean;
  createdAt: string;
  lastLogin: string;
}

export interface UpdateUserNameRequest {
  name: string;
}

export interface CheckUserAvailabilityRequest {
  username?: string;
  email?: string;
}

export interface CheckUserAvailabilityResponse {
  isUsernameAvailable: boolean;
  isEmailAvailable: boolean;
  usernameError?: string | null;
  emailError?: string | null;
}
