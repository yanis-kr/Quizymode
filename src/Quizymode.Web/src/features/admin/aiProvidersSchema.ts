import { z } from "zod";
import { LLM_VENDORS, type LlmVendor } from "@/api/adminLlmProviders";

const vendorSchema = z.enum(LLM_VENDORS as [LlmVendor, ...LlmVendor[]]);

const routeSchema = (label: string) =>
  z
    .array(vendorSchema)
    .min(1, `The ${label} route needs at least one vendor.`)
    .max(3, `The ${label} route can list at most three vendors.`)
    .refine((route) => new Set(route).size === route.length, `The ${label} route lists a vendor twice.`);

/** Mirrors the PUT /admin/llm-providers validation (AC 5.12). */
export const aiProvidersFormSchema = z.object({
  vendors: z.array(
    z.object({
      vendor: vendorSchema,
      model: z
        .string()
        .trim()
        .min(1, "Model is required.")
        .max(100, "Model must be 100 characters or less.")
        .regex(/^[A-Za-z0-9._:\-/]+$/, "Model may contain only letters, numbers, and . _ : - /"),
    })
  ),
  routes: z.object({
    free: routeSchema("free"),
    premium: routeSchema("premium"),
  }),
});

export type AiProvidersForm = z.infer<typeof aiProvidersFormSchema>;

/** Returns the first validation message (prefixed with the vendor for model errors), or null. */
export function validateAiProvidersForm(form: AiProvidersForm): string | null {
  const result = aiProvidersFormSchema.safeParse(form);
  if (result.success) return null;
  const issue = result.error.issues[0];
  if (!issue) return "Invalid settings.";
  if (issue.path[0] === "vendors" && typeof issue.path[1] === "number") {
    const vendor = form.vendors[issue.path[1]]?.vendor;
    return vendor ? `${vendor}: ${issue.message}` : issue.message;
  }
  return issue.message;
}

/** Moves the item at `index` by `delta` (−1 up, +1 down); returns a new array. */
export function moveItem<T>(values: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= values.length || target < 0 || target >= values.length) return values;
  const next = [...values];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
