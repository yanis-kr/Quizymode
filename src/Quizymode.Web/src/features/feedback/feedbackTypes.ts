import type { FeedbackType } from "@/types/api";

export interface FeedbackTypeOption {
  value: FeedbackType;
  label: string;
  helperText: string;
  detailsLabel: string;
  detailsPlaceholder: string;
}

export const feedbackTypeOptions: FeedbackTypeOption[] = [
  {
    value: "reportIssue",
    label: "Report issue",
    helperText: "Share the bug, what you expected, and what happened instead.",
    detailsLabel: "Issue details",
    detailsPlaceholder:
      "Describe what you were trying to do, what went wrong, and how to reproduce it.",
  },
  {
    value: "requestItems",
    label: "Ask for more items",
    helperText: "Request missing topics, question sets, or study areas.",
    detailsLabel: "What items should we add?",
    detailsPlaceholder:
      "Tell us what subject, exam, topic, or question type you want more of.",
  },
  {
    value: "generalFeedback",
    label: "Provide feedback",
    helperText: "Share feature ideas, product feedback, or general questions.",
    detailsLabel: "Feedback",
    detailsPlaceholder:
      "Tell us what would improve Quizymode, what feels confusing, or what you want to ask.",
  },
];

export const feedbackTypeMap = Object.fromEntries(
  feedbackTypeOptions.map((option) => [option.value, option])
) as Record<FeedbackType, FeedbackTypeOption>;
