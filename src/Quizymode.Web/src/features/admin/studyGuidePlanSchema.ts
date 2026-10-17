import { z } from "zod";

export const STUDY_GUIDE_PREMIUM_KEY = "StudyGuidePremium";
export const STUDY_GUIDE_DAILY_SECTIONS_KEY = "StudyGuideDailySections";
export const STUDY_GUIDE_MONTHLY_SECTIONS_KEY = "StudyGuideMonthlySections";

const overrideSchema = (label: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d+$/.test(value), `${label} must be a whole number.`)
    .refine((value) => value === "" || Number(value) <= 100_000, `${label} must be 100,000 or less.`);

/** Admin per-user study guide plan settings (AC 5.1). Blank overrides use the tier default. */
export const studyGuidePlanSchema = z.object({
  premium: z.boolean(),
  dailySections: overrideSchema("Daily sections"),
  monthlySections: overrideSchema("Monthly sections"),
});

export type StudyGuidePlanForm = z.infer<typeof studyGuidePlanSchema>;

export function planFormFromSettings(settings: Record<string, string>): StudyGuidePlanForm {
  return {
    premium: settings[STUDY_GUIDE_PREMIUM_KEY]?.toLowerCase() === "true",
    dailySections: settings[STUDY_GUIDE_DAILY_SECTIONS_KEY] ?? "",
    monthlySections: settings[STUDY_GUIDE_MONTHLY_SECTIONS_KEY] ?? "",
  };
}

/** Changed settings as key/value pairs. A cleared override is sent as "" (use the plan default). */
export function diffPlanSettings(
  settings: Record<string, string>,
  form: StudyGuidePlanForm
): Array<{ key: string; value: string }> {
  const original = planFormFromSettings(settings);
  const changes: Array<{ key: string; value: string }> = [];
  if (form.premium !== original.premium) {
    changes.push({ key: STUDY_GUIDE_PREMIUM_KEY, value: form.premium ? "true" : "false" });
  }
  if (form.dailySections.trim() !== original.dailySections.trim()) {
    changes.push({ key: STUDY_GUIDE_DAILY_SECTIONS_KEY, value: form.dailySections.trim() });
  }
  if (form.monthlySections.trim() !== original.monthlySections.trim()) {
    changes.push({ key: STUDY_GUIDE_MONTHLY_SECTIONS_KEY, value: form.monthlySections.trim() });
  }
  return changes;
}
