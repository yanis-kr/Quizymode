import { z } from "zod";

/** Matches the API limit: 10 KB of UTF-8 text. */
export const STUDY_GUIDE_UPLOAD_MAX_BYTES = 10 * 1024;
export const STUDY_GUIDE_UPLOAD_MAX_KEYWORDS = 10;

const textEncoder = new TextEncoder();

export function utf8ByteLength(text: string): number {
  return textEncoder.encode(text).length;
}

export function parseKeywordsInput(raw: string): string[] {
  return raw
    .split(",")
    .map((keyword) => keyword.trim().replace(/\s+/g, "-"))
    .filter((keyword) => keyword.length > 0);
}

export function createStudyGuideUploadSchema(maxBytes: number = STUDY_GUIDE_UPLOAD_MAX_BYTES) {
  return z.object({
    text: z
      .string()
      .refine((value) => value.trim().length > 0, "Paste your study guide text.")
      .refine(
        (value) => utf8ByteLength(value) <= maxBytes,
        `Study guide text must be ${Math.round(maxBytes / 1024)} KB or less.`
      ),
    category: z.string().trim().min(1, "Choose a category."),
    navigationKeyword1: z.string().trim().min(1, "Choose a primary topic."),
    navigationKeyword2: z.string().trim().min(1, "Choose a subtopic."),
    keywords: z
      .array(
        z
          .string()
          .max(30, "Keywords must be 30 characters or less.")
          .regex(/^[a-zA-Z0-9-]+$/, "Keywords may contain only letters, numbers, and hyphens.")
      )
      .max(
        STUDY_GUIDE_UPLOAD_MAX_KEYWORDS,
        `Add at most ${STUDY_GUIDE_UPLOAD_MAX_KEYWORDS} keywords.`
      ),
  });
}

export type StudyGuideUploadForm = z.infer<ReturnType<typeof createStudyGuideUploadSchema>>;

/** Returns the first validation message, or null when the form is valid. */
export function validateStudyGuideUploadForm(
  form: StudyGuideUploadForm,
  maxBytes: number = STUDY_GUIDE_UPLOAD_MAX_BYTES
): string | null {
  const result = createStudyGuideUploadSchema(maxBytes).safeParse(form);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid input.");
}
