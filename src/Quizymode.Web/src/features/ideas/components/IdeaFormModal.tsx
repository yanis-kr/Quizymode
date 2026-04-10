import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import TurnstileWidget from "./TurnstileWidget";

export interface IdeaFormValues {
  title: string;
  problem: string;
  proposedChange: string;
  tradeOffs: string;
  turnstileToken: string | null;
}

interface IdeaFormModalProps {
  isOpen: boolean;
  title: string;
  submitLabel: string;
  initialValues?: Partial<IdeaFormValues>;
  isPending: boolean;
  errorMessage?: string | null;
  helperText?: string | null;
  requireTurnstile?: boolean;
  onClose: () => void;
  onSubmit: (values: IdeaFormValues) => void;
}

const emptyValues: IdeaFormValues = {
  title: "",
  problem: "",
  proposedChange: "",
  tradeOffs: "",
  turnstileToken: null,
};

const IdeaFormModal = ({
  isOpen,
  title,
  submitLabel,
  initialValues,
  isPending,
  errorMessage,
  helperText,
  requireTurnstile = false,
  onClose,
  onSubmit,
}: IdeaFormModalProps) => {
  const [values, setValues] = useState<IdeaFormValues>(emptyValues);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setValues({
      title: initialValues?.title ?? "",
      problem: initialValues?.problem ?? "",
      proposedChange: initialValues?.proposedChange ?? "",
      tradeOffs: initialValues?.tradeOffs ?? "",
      turnstileToken: null,
    });
  }, [initialValues, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, isPending, onClose]);

  if (!isOpen) {
    return null;
  }

  const canSubmit =
    values.title.trim().length > 0 &&
    values.problem.trim().length > 0 &&
    values.proposedChange.trim().length > 0 &&
    (!requireTurnstile || !!values.turnstileToken);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 px-4 py-10 backdrop-blur-sm"
      onClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="idea-form-title"
        className="mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl"
        style={{ maxHeight: "calc(100vh - 5rem)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Ideas
            </p>
            <h2 id="idea-form-title" className="mt-1 text-2xl font-semibold text-slate-900">
              {title}
            </h2>
            {helperText && <p className="mt-2 text-sm text-slate-600">{helperText}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Close idea form"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit && !isPending) {
              onSubmit(values);
            }
          }}
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <div>
              <label htmlFor="idea-title" className="block text-sm font-medium text-slate-900">
                Title
              </label>
              <input
                id="idea-title"
                type="text"
                value={values.title}
                onChange={(event) =>
                  setValues((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="A short label people can scan quickly"
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <div>
              <label htmlFor="idea-problem" className="block text-sm font-medium text-slate-900">
                Problem
              </label>
              <textarea
                id="idea-problem"
                value={values.problem}
                onChange={(event) =>
                  setValues((current) => ({ ...current, problem: event.target.value }))
                }
                rows={4}
                placeholder="What is frustrating, missing, or unclear today?"
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <div>
              <label
                htmlFor="idea-proposed-change"
                className="block text-sm font-medium text-slate-900"
              >
                Proposed change
              </label>
              <textarea
                id="idea-proposed-change"
                value={values.proposedChange}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    proposedChange: event.target.value,
                  }))
                }
                rows={4}
                placeholder="Describe the product or workflow change you want."
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <div>
              <label htmlFor="idea-tradeoffs" className="block text-sm font-medium text-slate-900">
                Trade-offs
              </label>
              <textarea
                id="idea-tradeoffs"
                value={values.tradeOffs}
                onChange={(event) =>
                  setValues((current) => ({ ...current, tradeOffs: event.target.value }))
                }
                rows={3}
                placeholder="Optional. What complexity, cost, or downside should we remember?"
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            {requireTurnstile && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-900">Verification</p>
                <TurnstileWidget
                  onTokenChange={(token) =>
                    setValues((current) => ({ ...current, turnstileToken: token }))
                  }
                />
              </div>
            )}

            {errorMessage && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {errorMessage}
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || isPending}
              className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {isPending ? "Saving..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IdeaFormModal;
