// API Response Types

export interface CategoryResponse {
  category: string;
  count: number;
  id: string;
  isPrivate: boolean;
  averageStars: number | null;
}

export interface CategoriesResponse {
  categories: CategoryResponse[];
}

export interface SubcategoryResponse {
  subcategory: string;
  count: number;
}

export interface SubcategoriesResponse {
  subcategories: SubcategoryResponse[];
  totalCount: number;
}

export interface KeywordResponse {
  id: string;
  name: string;
  isPrivate: boolean;
}

export interface ItemResponse {
  id: string;
  category: string;
  subcategory: string;
  isPrivate: boolean;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  explanation: string;
  createdAt: string;
  keywords: KeywordResponse[];
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
  createdBy: string;
  createdAt: string;
  itemCount: number;
}

export interface CollectionsResponse {
  collections: CollectionResponse[];
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
  subcategory: string;
  isPrivate: boolean;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  explanation: string;
  keywords?: KeywordRequest[];
}

export interface UpdateItemRequest {
  category?: string;
  subcategory?: string;
  isPrivate?: boolean;
  question?: string;
  correctAnswer?: string;
  incorrectAnswers?: string[];
  explanation?: string;
  keywords?: KeywordRequest[];
}

export interface CreateCollectionRequest {
  name: string;
}

export interface UpdateCollectionRequest {
  name: string;
}

export interface AddItemToCollectionRequest {
  itemId: string;
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
