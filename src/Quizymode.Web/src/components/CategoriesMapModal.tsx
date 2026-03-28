import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MapIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { categoriesApi } from "@/api/categories";
import {
  taxonomyApi,
  type TaxonomyCategory,
  type TaxonomyL1,
  type TaxonomyL2,
} from "@/api/taxonomy";
import LoadingSpinner from "./LoadingSpinner";
import ErrorMessage from "./ErrorMessage";

interface CategoriesMapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CategoriesMapNode = {
  id: string;
  kind: "category" | "group" | "keyword";
  label: string;
  slug: string;
  description: string | null;
  href: string;
  children: CategoriesMapNode[];
};

const CATEGORY_BADGE_CLASSES =
  "border-sky-200 bg-sky-50 text-sky-700";
const GROUP_BADGE_CLASSES =
  "border-indigo-200 bg-indigo-50 text-indigo-700";
const KEYWORD_BADGE_CLASSES =
  "border-emerald-200 bg-emerald-50 text-emerald-700";

function formatFallbackLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((segment) => {
      if (/^[a-z]+[0-9-]*$/i.test(segment) && segment === segment.toUpperCase()) {
        return segment;
      }

      if (/^[a-z]{2,}\d+$/i.test(segment)) {
        return segment.toUpperCase();
      }

      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(" ");
}

function createKeywordNode(
  categorySlug: string,
  groupSlug: string,
  keyword: TaxonomyL2
): CategoriesMapNode {
  return {
    id: `${categorySlug}/${groupSlug}/${keyword.slug}`,
    kind: "keyword",
    label: keyword.slug,
    slug: keyword.slug,
    description: keyword.description,
    href: `/categories/${categorySlug}/${encodeURIComponent(groupSlug)}/${encodeURIComponent(keyword.slug)}`,
    children: [],
  };
}

function createGroupNode(
  categorySlug: string,
  group: TaxonomyL1
): CategoriesMapNode {
  return {
    id: `${categorySlug}/${group.slug}`,
    kind: "group",
    label: group.slug,
    slug: group.slug,
    description: group.description,
    href: `/categories/${categorySlug}/${encodeURIComponent(group.slug)}`,
    children: group.keywords.map((keyword) =>
      createKeywordNode(categorySlug, group.slug, keyword)
    ),
  };
}

function createCategoryNode(
  category: TaxonomyCategory,
  displayName: string | undefined,
  description: string | null | undefined
): CategoriesMapNode {
  return {
    id: category.slug,
    kind: "category",
    label: displayName ?? formatFallbackLabel(category.slug),
    slug: category.slug,
    description: description ?? category.description ?? null,
    href: `/categories/${category.slug}`,
    children: category.groups.map((group) => createGroupNode(category.slug, group)),
  };
}

function collectExpandableNodeIds(nodes: CategoriesMapNode[]): string[] {
  return nodes.flatMap((node) => {
    if (node.children.length === 0) {
      return [];
    }

    return [node.id, ...collectExpandableNodeIds(node.children)];
  });
}

function collectCategoryNodeIds(nodes: CategoriesMapNode[]): string[] {
  return nodes.filter((node) => node.kind === "category").map((node) => node.id);
}

function TreeNode({
  node,
  level,
  expandedNodeIds,
  onToggle,
  onNavigate,
}: {
  node: CategoriesMapNode;
  level: number;
  expandedNodeIds: Set<string>;
  onToggle: (nodeId: string) => void;
  onNavigate: () => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = hasChildren && expandedNodeIds.has(node.id);
  const badgeClasses =
    node.kind === "category"
      ? CATEGORY_BADGE_CLASSES
      : node.kind === "group"
        ? GROUP_BADGE_CLASSES
        : KEYWORD_BADGE_CLASSES;
  const badgeLabel =
    node.kind === "category"
      ? "Category"
      : node.kind === "group"
        ? "Primary topic"
        : "Subtopic";

  return (
    <li>
      <div className="rounded-[22px] border border-slate-200/80 bg-white/85 shadow-sm shadow-slate-300/20 backdrop-blur">
        <div
          className="flex items-start gap-3 p-3 sm:p-4"
          style={{ paddingLeft: `${level * 1.25 + 0.75}rem` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-sky-300 hover:text-sky-700"
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.label}`}
              aria-expanded={isExpanded}
            >
              {isExpanded ? (
                <ChevronDownIcon className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronRightIcon className="h-4 w-4" aria-hidden />
              )}
            </button>
          ) : (
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400">
              <div className="h-2 w-2 rounded-full bg-current" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={node.href}
                onClick={onNavigate}
                className="text-sm font-semibold text-slate-900 transition hover:text-sky-700 sm:text-base"
              >
                {node.label}
              </Link>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${badgeClasses}`}
              >
                {badgeLabel}
              </span>
              <code className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                {node.slug}
              </code>
            </div>
            {node.description && (
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {node.description}
              </p>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="pb-3">
            <ul className="space-y-3">
              {node.children.map((child) => (
                <TreeNode
                  key={child.id}
                  node={child}
                  level={level + 1}
                  expandedNodeIds={expandedNodeIds}
                  onToggle={onToggle}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
}

const CategoriesMapModal = ({
  isOpen,
  onClose,
}: CategoriesMapModalProps) => {
  const { data: taxonomyData, isLoading, error, refetch } = useQuery({
    queryKey: ["taxonomy"],
    queryFn: () => taxonomyApi.getAll(),
    enabled: isOpen,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const categoryDisplayMap = useMemo(() => {
    const map = new Map<string, { label: string; description: string | null }>();

    for (const category of categoriesData?.categories ?? []) {
      map.set(category.category.toLowerCase(), {
        label: category.category,
        description: category.description ?? category.shortDescription ?? null,
      });
    }

    return map;
  }, [categoriesData?.categories]);

  const nodes = useMemo(
    () =>
      (taxonomyData?.categories ?? []).map((category) => {
        const categoryDisplay = categoryDisplayMap.get(category.slug.toLowerCase());

        return createCategoryNode(
          category,
          categoryDisplay?.label,
          categoryDisplay?.description
        );
      }),
    [categoryDisplayMap, taxonomyData?.categories]
  );

  const expandableNodeIds = useMemo(
    () => collectExpandableNodeIds(nodes),
    [nodes]
  );
  const categoryNodeIds = useMemo(
    () => collectCategoryNodeIds(nodes),
    [nodes]
  );

  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setExpandedNodeIds(new Set(categoryNodeIds));
  }, [categoryNodeIds, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="categories-map-title"
    >
      <div
        className="relative flex max-h-[min(92vh,60rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(239,246,255,0.98)_100%)] shadow-2xl shadow-slate-950/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative overflow-hidden border-b border-slate-200/80 bg-slate-950 px-6 py-6 text-white sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(125,211,252,0.28)_0%,transparent_38%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(30,41,59,0.92)_0%,rgba(15,23,42,0.98)_100%)]" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-200">
                <MapIcon className="h-4 w-4" aria-hidden />
                Browse structure
              </div>
              <h2
                id="categories-map-title"
                className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                Categories map
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Open any category, primary topic, or subtopic directly from the
                canonical taxonomy tree.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/10 text-slate-200 transition hover:bg-white/16 hover:text-white"
              aria-label="Close categories map"
            >
              <XMarkIcon className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/70 px-6 py-4 sm:px-8">
          <p className="text-sm text-slate-600">
            {nodes.length} categor{nodes.length === 1 ? "y" : "ies"} in the
            current taxonomy.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setExpandedNodeIds(new Set(expandableNodeIds))}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => setExpandedNodeIds(new Set())}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            >
              Collapse all
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {isLoading ? (
            <div className="flex min-h-64 items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <ErrorMessage
              message="Could not load the categories map."
              errorDetail={error instanceof Error ? error.message : undefined}
              onRetry={() => {
                void refetch();
              }}
            />
          ) : nodes.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/80 px-6 py-12 text-center">
              <p className="text-base font-medium text-slate-900">
                No taxonomy categories are available right now.
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Try again later or reload the page.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {nodes.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  level={0}
                  expandedNodeIds={expandedNodeIds}
                  onToggle={(nodeId) => {
                    setExpandedNodeIds((previous) => {
                      const next = new Set(previous);

                      if (next.has(nodeId)) {
                        next.delete(nodeId);
                      } else {
                        next.add(nodeId);
                      }

                      return next;
                    });
                  }}
                  onNavigate={onClose}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoriesMapModal;
