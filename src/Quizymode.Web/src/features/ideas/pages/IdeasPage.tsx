import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRightIcon, LightBulbIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import { ideasApi, type IdeaSummaryResponse, type IdeaStatus } from "@/api/ideas";
import ErrorMessage from "@/components/ErrorMessage";
import LoadingSpinner from "@/components/LoadingSpinner";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import { getApiErrorMessage } from "@/utils/apiError";
import IdeaCard from "../components/IdeaCard";
import IdeaFormModal, { type IdeaFormValues } from "../components/IdeaFormModal";
import {
  type BoardSort,
  formatModerationLabel,
  groupIdeasByModeration,
  groupIdeasByStatus,
  matchesIdeaSearch,
  MODERATION_ORDER,
  sortIdeas,
  STATUS_ORDER,
} from "../ideaBoard";

const IdeasPage = () => {
  const { isAdmin, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<BoardSort>("recent");
  const [expandedIdeaIds, setExpandedIdeaIds] = useState<string[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<IdeaSummaryResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusUpdatingIdeaId, setStatusUpdatingIdeaId] = useState<string | null>(
    null
  );

  const boardQuery = useQuery({
    queryKey: ["ideas", "board"],
    queryFn: () => ideasApi.getBoard(),
  });

  const mineQuery = useQuery({
    queryKey: ["ideas", "mine"],
    queryFn: () => ideasApi.getMine(),
    enabled: isAuthenticated,
  });

  const invalidateIdeaQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["ideas", "board"] });
    queryClient.invalidateQueries({ queryKey: ["ideas", "mine"] });
    queryClient.invalidateQueries({ queryKey: ["ideas", "admin"] });
  };

  const createMutation = useMutation({
    mutationFn: (values: IdeaFormValues) =>
      ideasApi.create({
        title: values.title.trim(),
        problem: values.problem.trim(),
        proposedChange: values.proposedChange.trim(),
        tradeOffs: values.tradeOffs.trim() || null,
        turnstileToken: values.turnstileToken ?? "",
      }),
    onSuccess: () => {
      setActionError(null);
      setFormError(null);
      setCreateModalOpen(false);
      invalidateIdeaQueries();
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: IdeaFormValues) => {
      if (!editingIdea) {
        throw new Error("No idea is selected for editing.");
      }

      return ideasApi.update(editingIdea.id, {
        title: values.title.trim(),
        problem: values.problem.trim(),
        proposedChange: values.proposedChange.trim(),
        tradeOffs: values.tradeOffs.trim() || null,
      });
    },
    onSuccess: () => {
      setActionError(null);
      setFormError(null);
      setEditingIdea(null);
      invalidateIdeaQueries();
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ideaId: string) => ideasApi.delete(ideaId),
    onSuccess: () => {
      setActionError(null);
      invalidateIdeaQueries();
    },
    onError: (error) => {
      setActionError(getApiErrorMessage(error));
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ ideaId, status }: { ideaId: string; status: IdeaStatus }) =>
      ideasApi.updateStatus(ideaId, { status }),
    onMutate: ({ ideaId }) => {
      setStatusUpdatingIdeaId(ideaId);
    },
    onSuccess: () => {
      setActionError(null);
      invalidateIdeaQueries();
    },
    onError: (error) => {
      setActionError(getApiErrorMessage(error));
    },
    onSettled: () => {
      setStatusUpdatingIdeaId(null);
    },
  });

  const boardIdeas = boardQuery.data?.ideas ?? [];
  const filteredBoardIdeas = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return sortIdeas(
      boardIdeas.filter((idea) => matchesIdeaSearch(idea, normalizedSearch)),
      sortBy
    );
  }, [boardIdeas, search, sortBy]);

  const groupedBoardIdeas = useMemo(
    () => groupIdeasByStatus(filteredBoardIdeas),
    [filteredBoardIdeas]
  );

  const myIdeas = mineQuery.data?.ideas ?? [];
  const groupedMyIdeas = useMemo(
    () => groupIdeasByModeration(sortIdeas(myIdeas, "recent")),
    [myIdeas]
  );

  const boardHasResults = filteredBoardIdeas.length > 0;
  const modalPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <SEO
        title="Ideas"
        description="Browse proposed, planned, in-progress, shipped, and archived Quizymode ideas. Signed-in users can submit new ideas, rate them, and join the discussion."
        canonical="https://www.quizymode.com/ideas"
      />

      <div className="bg-[radial-gradient(circle_at_top_left,#ecfccb_0%,#dcfce7_18%,#f8fafc_42%,#e2e8f0_100%)] text-slate-900">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <section className="overflow-hidden rounded-[36px] border border-emerald-200/70 bg-[linear-gradient(135deg,rgba(248,250,252,0.96)_0%,rgba(236,253,245,0.96)_46%,rgba(220,252,231,0.98)_100%)] shadow-2xl shadow-emerald-950/10">
            <div className="grid gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.9fr)] lg:px-8 lg:py-9">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                  <LightBulbIcon className="h-4 w-4" aria-hidden />
                  Ideas board
                </div>
                <h1 className="mt-4 max-w-3xl font-serif text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                  Product thinking, out in the open
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-8 text-slate-700">
                  Each idea stays intentionally simple: the problem, the proposed
                  change, the trade-offs, the current status, and the conversation
                  around whether it is worth building.
                </p>
              </div>

              <div className="rounded-[28px] border border-emerald-200 bg-white/80 p-5 shadow-lg shadow-emerald-950/5">
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                  How this board works
                </div>
                <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
                  <li>Anyone can browse published ideas, ratings, and comments.</li>
                  <li>Signed-in users can submit ideas, rate, and join the discussion.</li>
                  <li>New submissions start in review before they go public.</li>
                </ul>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {isAuthenticated ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFormError(null);
                        setCreateModalOpen(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      Share an idea
                      <ArrowUpRightIcon className="h-4 w-4" aria-hidden />
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      <Link to="/login" className="font-semibold text-emerald-700 hover:text-emerald-800">
                        Sign in
                      </Link>{" "}
                      to submit ideas, rate, and comment.
                    </div>
                  )}

                  {isAdmin && (
                    <Link
                      to="/admin/ideas"
                      className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-white"
                    >
                      Moderate ideas
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </section>

          {isAuthenticated && (
            <section className="mt-6 rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-xl shadow-slate-950/5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">
                    My submissions
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Pending, published, and rejected ideas stay visible here even when
                    they are not public yet.
                  </p>
                </div>
              </div>

              {mineQuery.isLoading ? (
                <div className="mt-4">
                  <LoadingSpinner />
                </div>
              ) : mineQuery.error ? (
                <div className="mt-4">
                  <ErrorMessage
                    message="Failed to load your idea submissions"
                    errorDetail={getApiErrorMessage(mineQuery.error)}
                    onRetry={() => mineQuery.refetch()}
                  />
                </div>
              ) : myIdeas.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                  You have not submitted any ideas yet.
                </div>
              ) : (
                <div className="mt-4 grid gap-5 lg:grid-cols-3">
                  {MODERATION_ORDER.map((moderationState) => (
                    <div
                      key={moderationState}
                      className="rounded-[24px] border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-slate-900">
                          {formatModerationLabel(moderationState)}
                        </h3>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {groupedMyIdeas[moderationState].length}
                        </span>
                      </div>

                      <div className="mt-4 space-y-4">
                        {groupedMyIdeas[moderationState].length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500">
                            Nothing here right now.
                          </div>
                        ) : (
                          groupedMyIdeas[moderationState].map((idea) => (
                            <IdeaCard
                              key={`mine:${idea.id}`}
                              idea={idea}
                              expanded={expandedIdeaIds.includes(`mine:${idea.id}`)}
                              sectionStyle="private"
                              statusUpdatePending={statusUpdatingIdeaId === idea.id}
                              onToggleExpand={() =>
                                toggleExpandedId(`mine:${idea.id}`, setExpandedIdeaIds)
                              }
                              onEdit={() => {
                                setFormError(null);
                                setEditingIdea(idea);
                              }}
                              onDelete={() => {
                                if (window.confirm("Delete this idea?")) {
                                  deleteMutation.mutate(idea.id);
                                }
                              }}
                              onStatusChange={(status) =>
                                statusMutation.mutate({ ideaId: idea.id, status })
                              }
                            />
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="mt-6 rounded-[30px] border border-slate-200 bg-white/92 p-5 shadow-xl shadow-slate-950/5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">
                  Public board
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Published ideas are grouped by lifecycle state and can be sorted by
                  recent activity or rating.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="min-w-0">
                  <span className="sr-only">Search ideas</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search titles, problems, changes, or trade-offs"
                    className="w-full rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-emerald-500 sm:w-80"
                  />
                </label>

                <label className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700">
                  <span className="font-medium text-slate-500">Sort</span>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as BoardSort)}
                    className="bg-transparent outline-none"
                  >
                    <option value="recent">Recently updated</option>
                    <option value="rating">Top rated</option>
                  </select>
                </label>
              </div>
            </div>

            {actionError && (
              <div className="mt-4">
                <ErrorMessage
                  message="Idea action failed"
                  errorDetail={actionError}
                  onRetry={() => {
                    setActionError(null);
                    boardQuery.refetch();
                    if (isAuthenticated) {
                      mineQuery.refetch();
                    }
                  }}
                />
              </div>
            )}

            {boardQuery.isLoading ? (
              <div className="mt-6">
                <LoadingSpinner />
              </div>
            ) : boardQuery.error ? (
              <div className="mt-6">
                <ErrorMessage
                  message="Failed to load the ideas board"
                  errorDetail={getApiErrorMessage(boardQuery.error)}
                  onRetry={() => boardQuery.refetch()}
                />
              </div>
            ) : !boardHasResults ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                No ideas match that search yet.
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {STATUS_ORDER.map((status) => (
                  <div
                    key={status}
                    className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xl font-semibold text-slate-900">{status}</h3>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {groupedBoardIdeas[status].length}
                      </span>
                    </div>

                    {groupedBoardIdeas[status].length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500">
                        No ideas in this lane yet.
                      </div>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {groupedBoardIdeas[status].map((idea) => (
                          <IdeaCard
                            key={`board:${idea.id}`}
                            idea={idea}
                            expanded={expandedIdeaIds.includes(`board:${idea.id}`)}
                            statusUpdatePending={statusUpdatingIdeaId === idea.id}
                            onToggleExpand={() =>
                              toggleExpandedId(`board:${idea.id}`, setExpandedIdeaIds)
                            }
                            onEdit={() => {
                              setFormError(null);
                              setEditingIdea(idea);
                            }}
                            onDelete={() => {
                              if (window.confirm("Delete this idea?")) {
                                deleteMutation.mutate(idea.id);
                              }
                            }}
                            onStatusChange={(nextStatus) =>
                              statusMutation.mutate({
                                ideaId: idea.id,
                                status: nextStatus,
                              })
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <IdeaFormModal
        isOpen={createModalOpen || editingIdea !== null}
        title={editingIdea ? "Edit idea" : "Share an idea"}
        submitLabel={editingIdea ? "Save changes" : "Submit for review"}
        initialValues={
          editingIdea
            ? {
                title: editingIdea.title,
                problem: editingIdea.problem,
                proposedChange: editingIdea.proposedChange,
                tradeOffs: editingIdea.tradeOffs ?? "",
              }
            : undefined
        }
        isPending={modalPending}
        errorMessage={formError}
        helperText={
          editingIdea
            ? "Editing a published or rejected idea sends it back through review."
            : "New ideas are screened for abuse, then held for moderation before they appear on the public board."
        }
        requireTurnstile={!editingIdea}
        onClose={() => {
          if (modalPending) {
            return;
          }

          setCreateModalOpen(false);
          setEditingIdea(null);
          setFormError(null);
        }}
        onSubmit={(values) => {
          if (editingIdea) {
            updateMutation.mutate(values);
            return;
          }

          createMutation.mutate(values);
        }}
      />
    </>
  );
};

function toggleExpandedId(
  id: string,
  setExpandedIdeaIds: Dispatch<SetStateAction<string[]>>
) {
  setExpandedIdeaIds((current) =>
    current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]
  );
}

export default IdeasPage;
