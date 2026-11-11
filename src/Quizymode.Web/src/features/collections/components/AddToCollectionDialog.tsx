import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "@/api/collections";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { searchApi } from "@/api/search";

/** The deepest a collection may nest: root is level 0, so a member may sit at most this many levels below it (AC 1.16.5). */
export const MAX_NESTING_DEPTH = 3;

type TabId = "questions" | "topics" | "collections";

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "questions", label: "Questions", hint: "Add one of your questions to this collection." },
  { id: "topics", label: "Topics", hint: "Add a public topic. Its questions show up here and update automatically." },
  { id: "collections", label: "Collections", hint: "Nest one of your collections inside this one." },
];

interface AddToCollectionDialogProps {
  open: boolean;
  onClose: () => void;
  collectionId: string;
  /** Ids of the collections above this one, root first. Empty for a root collection. */
  ancestorIds: string[];
}

/**
 * The owner's "Add to collection" picker (#558): three tabs (Questions, Topics, Collections).
 * Escape closes it and focus returns to the element that opened it. Tab stays inside the dialog.
 * Full-width below the sm breakpoint. A collection that would nest too deep, or would form a cycle, is shown disabled with a reason.
 */
export function AddToCollectionDialog({ open, onClose, collectionId, ancestorIds }: AddToCollectionDialogProps) {
  const [tab, setTab] = useState<TabId>("questions");
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    // Focus the first control inside the dialog once it is rendered.
    const first = dialogRef.current?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']");
    first?.focus();
    return () => {
      returnFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, [href], [tabindex]:not([tabindex='-1'])")
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-collection-title"
        onKeyDown={handleKeyDown}
        className="flex h-full w-full flex-col overflow-hidden bg-surface p-4 shadow-xl sm:h-auto sm:max-h-[85vh] sm:w-[min(32rem,calc(100vw-2rem))] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="add-to-collection-title" className="text-lg font-semibold text-slate-900">
            Add to collection
          </h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
            Close
          </button>
        </div>

        <div role="tablist" aria-label="What to add" className="mt-3 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`add-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`add-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                tab === t.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="mt-2 text-sm text-slate-600">{activeTab.hint}</p>

        <div
          role="tabpanel"
          id={`add-panel-${tab}`}
          aria-labelledby={`add-tab-${tab}`}
          className="mt-3 min-h-0 flex-1 overflow-y-auto"
        >
          {tab === "questions" && <QuestionsPanel collectionId={collectionId} />}
          {tab === "topics" && <TopicsPanel collectionId={collectionId} />}
          {tab === "collections" && <CollectionsPanel collectionId={collectionId} ancestorIds={ancestorIds} />}
        </div>
      </div>
    </div>
  );
}

function useInvalidateCollections() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["collections"] });
}

function QuestionsPanel({ collectionId }: { collectionId: string }) {
  const [text, setText] = useState("");
  const query = text.trim();
  const invalidate = useInvalidateCollections();
  const { data, isFetching } = useQuery({
    queryKey: ["add-to-collection", "mine", query],
    queryFn: ({ signal }) => searchApi.search({ q: query, types: ["mine"], limit: 20, offset: 0 }, signal),
    enabled: query.length >= 2,
  });
  const items = (data?.groups.mine?.results ?? []).filter((r) => r.kind === "item");

  const add = useMutation({
    mutationFn: (itemId: string) => collectionsApi.addItem(collectionId, { itemId }),
    onSuccess: invalidate,
  });

  return (
    <div>
      <label htmlFor="add-question-search" className="text-sm font-medium text-slate-700">
        Find your question
      </label>
      <input
        id="add-question-search"
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type at least 2 letters"
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      {query.length >= 2 && isFetching && <p className="mt-2 text-sm text-slate-500">Searching…</p>}
      {query.length >= 2 && !isFetching && items.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">No questions match.</p>
      )}
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 p-2">
            <span className="min-w-0 flex-1 break-words text-sm text-slate-900">{item.title}</span>
            <button
              type="button"
              onClick={() => add.mutate(item.id)}
              disabled={add.isPending}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Add
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopicsPanel({ collectionId }: { collectionId: string }) {
  const invalidate = useInvalidateCollections();
  const [categoryId, setCategoryId] = useState("");
  const [openKeyword1, setOpenKeyword1] = useState<string | null>(null);

  const { data: categoriesData } = useQuery({
    queryKey: ["add-to-collection", "categories"],
    queryFn: () => categoriesApi.getAll(),
  });
  const categories = (categoriesData?.categories ?? []).filter((c) => !c.isPrivate);
  const selected = categories.find((c) => c.id === categoryId);

  const { data: level1Data } = useQuery({
    queryKey: ["add-to-collection", "keywords", selected?.category],
    queryFn: () => keywordsApi.getNavigationKeywords(selected!.category),
    enabled: Boolean(selected),
  });
  const level1 = (level1Data?.keywords ?? []).filter((k) => k.id);

  const add = useMutation({
    mutationFn: (topic: { keyword1Id: string; keyword2Id: string | null }) =>
      collectionsApi.addTopic(collectionId, {
        categoryId,
        keyword1Id: topic.keyword1Id,
        keyword2Id: topic.keyword2Id,
      }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="add-topic-category" className="text-sm font-medium text-slate-700">
          Category
        </label>
        <select
          id="add-topic-category"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setOpenKeyword1(null);
          }}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Choose a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.category}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <ul className="space-y-2">
          {level1.map((k) => (
            <TopicRow
              key={k.id!}
              categoryName={selected.category}
              keyword1Name={k.name}
              expanded={openKeyword1 === k.id}
              onToggle={() => setOpenKeyword1(openKeyword1 === k.id ? null : k.id!)}
              onAdd={(keyword2Id) => add.mutate({ keyword1Id: k.id!, keyword2Id })}
              disabled={add.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TopicRow({
  categoryName,
  keyword1Name,
  expanded,
  onToggle,
  onAdd,
  disabled,
}: {
  categoryName: string;
  keyword1Name: string;
  expanded: boolean;
  onToggle: () => void;
  onAdd: (keyword2Id: string | null) => void;
  disabled: boolean;
}) {
  const { data } = useQuery({
    queryKey: ["add-to-collection", "keywords", categoryName, keyword1Name],
    queryFn: () => keywordsApi.getNavigationKeywords(categoryName, [keyword1Name]),
    enabled: expanded,
  });
  const level2 = (data?.keywords ?? []).filter((k) => k.id);

  return (
    <li className="rounded-md border border-slate-200 p-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words text-sm font-medium text-slate-900">{keyword1Name}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => onAdd(null)} disabled={disabled} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
            Add {keyword1Name}
          </button>
          <button type="button" onClick={onToggle} aria-expanded={expanded} className="rounded-md px-2 py-1 text-sm text-indigo-700">
            {expanded ? "Hide subtopics" : "Subtopics"}
          </button>
        </div>
      </div>
      {expanded && (
        <ul className="mt-2 space-y-1 pl-3">
          {level2.map((k) => (
            <li key={k.id!} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 break-words text-sm text-slate-700">{k.name}</span>
              <button type="button" onClick={() => onAdd(k.id!)} disabled={disabled} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                Add {k.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function CollectionsPanel({ collectionId, ancestorIds }: { collectionId: string; ancestorIds: string[] }) {
  const invalidate = useInvalidateCollections();
  const { data } = useQuery({
    queryKey: ["add-to-collection", "mine-collections"],
    queryFn: () => collectionsApi.getAll(),
  });
  const candidates = useMemo(
    () => (data?.collections ?? []).filter((c) => c.id !== collectionId),
    [data, collectionId]
  );

  // Height of each candidate's subtree (1 = no nested collections), read to MAX_NESTING_DEPTH levels.
  const { data: heights } = useQuery({
    queryKey: ["add-to-collection", "heights", collectionId, candidates.map((c) => c.id).join(",")],
    queryFn: async () => {
      const result: Record<string, number> = {};
      for (const c of candidates) {
        result[c.id] = await subtreeHeight(c.id, MAX_NESTING_DEPTH);
      }
      return result;
    },
    enabled: candidates.length > 0,
  });

  const depth = ancestorIds.length;
  const add = useMutation({
    mutationFn: (childId: string) => collectionsApi.addChildCollection(collectionId, childId),
    onSuccess: invalidate,
  });

  if (candidates.length === 0) {
    return <p className="text-sm text-slate-500">You have no other collections to nest here.</p>;
  }

  return (
    <ul className="space-y-2">
      {candidates.map((c) => {
        const cycle = ancestorIds.includes(c.id);
        const height = heights?.[c.id] ?? 1;
        const tooDeep = !cycle && depth + height > MAX_NESTING_DEPTH;
        const reason = cycle
          ? "Would create a cycle: this collection is already above the current one."
          : tooDeep
            ? `Would nest deeper than ${MAX_NESTING_DEPTH} levels.`
            : null;
        return (
          <li key={c.id} className="rounded-md border border-slate-200 p-2">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 break-words text-sm font-medium text-slate-900">{c.name}</span>
              <button
                type="button"
                onClick={() => add.mutate(c.id)}
                disabled={Boolean(reason) || add.isPending}
                aria-describedby={reason ? `reason-${c.id}` : undefined}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
              >
                Add
              </button>
            </div>
            {reason && (
              <p id={`reason-${c.id}`} className="mt-1 text-xs text-amber-800">
                {reason}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

async function subtreeHeight(collectionId: string, remaining: number): Promise<number> {
  if (remaining <= 1) return 1;
  const response = await collectionsApi.listChildCollections(collectionId);
  const visible = response.children.filter((child) => !child.hiddenFromOthers);
  if (visible.length === 0) return 1;
  const heights = await Promise.all(visible.map((child) => subtreeHeight(child.id, remaining - 1)));
  return 1 + Math.max(...heights);
}
