/**
 * Shared shell for Explore and Quiz modes: header, index/prev/next, body slot,
 * ratings/comments, collection controls.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon } from "@heroicons/react/24/outline";
import type { ItemResponse } from "@/types/api";
import ItemRatingsComments from "@/components/ItemRatingsComments";
import { ItemCollectionControls } from "@/components/ItemCollectionControls";

export interface StudyShellProps {
  /** Back link / breadcrumb above the card */
  backContent?: ReactNode;
  title: string;
  description?: string;
  /** Optional control (e.g. quiz size) to show in header */
  headerExtra?: ReactNode;
  currentIndex: number;
  totalCount: number;
  onPrev: () => void;
  onNext: () => void;
  isPrevDisabled: boolean;
  isNextDisabled: boolean;
  currentItem: ItemResponse | undefined;
  /** Body: ExploreRenderer or QuizRenderer output */
  children: ReactNode;
  navigationContext?: {
    mode: "explore" | "quiz";
    category?: string;
    collectionId?: string;
    currentIndex: number;
    itemIds: string[];
  };
  onOpenComments: (itemId: string) => void;
  onOpenManageCollections: (itemId: string) => void;
  /** Called after add/remove so parent can update item in cache (e.g. quiz mode). */
  onCollectionChange?: (
    itemId: string,
    updatedCollectionIds: Set<string>,
    payload: { added?: { id: string; name: string }; removedId?: string }
  ) => void;
  isAuthenticated: boolean;
  /** When false (e.g. quiz before answer), hide ratings and collection controls. Default true. */
  showRatingsAndCollections?: boolean;
  /** Footer (back to collection / categories) */
  footerContent?: ReactNode;
  /** Sign-up prompt when not authenticated */
  signUpPrompt?: ReactNode;
}

export function StudyShell({
  backContent,
  title,
  description,
  headerExtra,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  isPrevDisabled,
  isNextDisabled,
  currentItem,
  children,
  navigationContext,
  onOpenComments,
  onOpenManageCollections,
  onCollectionChange,
  isAuthenticated,
  showRatingsAndCollections = true,
  footerContent,
  signUpPrompt,
}: StudyShellProps) {
  return (
    <div className="max-w-4xl mx-auto">
        {backContent}

        <div className="bg-white shadow rounded-lg p-6 mb-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            {currentItem && (
              <Link
                to={`/items/${currentItem.id}`}
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-md"
                title="View item details"
              >
                <EyeIcon className="h-5 w-5" />
              </Link>
            )}
          </div>
          {description && (
            <p className="text-gray-600 text-sm mb-4">{description}</p>
          )}
          {headerExtra}

          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={isPrevDisabled}
                  className="p-1 text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
                  title="Previous item"
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <span className="text-sm text-gray-500 min-w-[80px] text-center">
                  {currentIndex + 1} of {totalCount}
                </span>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={isNextDisabled}
                  className="p-1 text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
                  title="Next item"
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {currentItem && (
            <div className="space-y-4">
              {children}

              {showRatingsAndCollections && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ItemRatingsComments
                    itemId={currentItem.id}
                    navigationContext={navigationContext}
                    onOpenComments={onOpenComments}
                  />
                  {(isAuthenticated ||
                    (currentItem.collections && currentItem.collections.length > 0)) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <ItemCollectionControls
                        itemId={currentItem.id}
                        itemCollectionIds={new Set(
                          (currentItem.collections ?? []).map((c) => c.id)
                        )}
                        onOpenManageCollections={() => onOpenManageCollections(currentItem.id)}
                        onSuccess={
                          onCollectionChange
                            ? (ids, payload) =>
                                onCollectionChange(currentItem.id, ids, payload)
                            : undefined
                        }
                      />
                      {currentItem.collections &&
                        currentItem.collections.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {currentItem.collections.map((collection) => (
                              <Link
                                key={collection.id}
                                to={`/collections?selected=${collection.id}`}
                                className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
                                title={`Collection: ${collection.name}`}
                              >
                                {collection.name}
                              </Link>
                            ))}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between mt-6">
            <button
              type="button"
              onClick={onPrev}
              disabled={isPrevDisabled}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={isNextDisabled}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>

        {signUpPrompt}

        {footerContent && (
          <div className="text-center">{footerContent}</div>
        )}
    </div>
  );
}
