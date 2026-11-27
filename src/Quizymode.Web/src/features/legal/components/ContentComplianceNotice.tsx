import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useContentComplianceNotice } from "@/hooks/useContentComplianceNotice";

const ContentComplianceNotice = () => {
  const { shouldShow, dismiss, isDismissing } = useContentComplianceNotice();
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesId = useId();

  if (!shouldShow) {
    return null;
  }

  return (
    <section className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm sm:mb-6">
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Before you add content: only add material you have the right to use.</p>
          <button
            type="button"
            aria-expanded={rulesOpen}
            aria-controls={rulesId}
            onClick={() => setRulesOpen(!rulesOpen)}
            className="mt-1 inline-flex min-h-8 items-center gap-2 text-sm font-medium underline hover:text-amber-800"
          >
            <span aria-hidden>{rulesOpen ? "▾" : "▸"}</span>
            Read the content rules
          </button>
          <div id={rulesId} hidden={!rulesOpen}>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
              <li>Only submit material you created or have the rights and permission to use.</li>
              <li>Do not submit personal, confidential, or private information about other people unless you are allowed to share it.</li>
              <li>Review AI-generated content for accuracy before saving or sharing it.</li>
              <li>If you later put items into a public collection, those items may be visible to other users in that collection context.</li>
            </ul>
            <p className="mt-3 text-sm">
              Review the{" "}
              <Link to="/terms" className="font-medium underline hover:text-amber-800">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="font-medium underline hover:text-amber-800">
                Privacy Policy
              </Link>
              .
            </p>
            <div className="mt-3">
              <button
                type="button"
                onClick={dismiss}
                disabled={isDismissing}
                className="inline-flex items-center justify-center rounded-md border border-amber-400 bg-surface px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
              >
                {isDismissing ? "Saving..." : "I understand, don't show again"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContentComplianceNotice;
