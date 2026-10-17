import { z } from "zod";
import { STUDY_GUIDE_UPLOAD_MAX_KEYWORDS, utf8ByteLength } from "./studyGuideUploadSchema";

export type StudyGuideInputMode = "file" | "text";

export interface StudyGuideDocumentLimits {
  maxFileBytes: number;
  maxTextBytes: number;
  acceptedExtensions: string[];
}

export const DEFAULT_DOCUMENT_LIMITS: StudyGuideDocumentLimits = {
  maxFileBytes: 20 * 1024 * 1024,
  maxTextBytes: 1_048_576,
  acceptedExtensions: [".pdf", ".docx", ".pptx", ".txt", ".md"],
};

export const STUDY_GUIDE_TITLE_MAX_LENGTH = 200;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

const keywordsSchema = z
  .array(
    z
      .string()
      .max(30, "Keywords must be 30 characters or less.")
      .regex(/^[a-zA-Z0-9-]+$/, "Keywords may contain only letters, numbers, and hyphens.")
  )
  .max(STUDY_GUIDE_UPLOAD_MAX_KEYWORDS, `Add at most ${STUDY_GUIDE_UPLOAD_MAX_KEYWORDS} keywords.`);

export function createStudyGuideDocumentFormSchema(limits: StudyGuideDocumentLimits = DEFAULT_DOCUMENT_LIMITS) {
  const accepted = limits.acceptedExtensions.map((extension) => extension.toLowerCase());
  return z
    .object({
      mode: z.enum(["file", "text"]),
      file: z.custom<File | null>((value) => value === null || value instanceof File),
      text: z.string(),
      title: z
        .string()
        .max(STUDY_GUIDE_TITLE_MAX_LENGTH, `Title must be ${STUDY_GUIDE_TITLE_MAX_LENGTH} characters or less.`),
      category: z.string().trim().min(1, "Choose a category."),
      navigationKeyword1: z.string().trim().min(1, "Choose a primary topic."),
      navigationKeyword2: z.string().trim().min(1, "Choose a subtopic."),
      keywords: keywordsSchema,
    })
    .superRefine((form, ctx) => {
      if (form.mode === "file") {
        if (!form.file) {
          ctx.addIssue({ code: "custom", path: ["file"], message: "Choose a file to upload." });
          return;
        }
        if (!accepted.includes(fileExtension(form.file.name))) {
          ctx.addIssue({
            code: "custom",
            path: ["file"],
            message: `Unsupported file type. Use ${accepted.join(", ")}.`,
          });
          return;
        }
        if (form.file.size === 0) {
          ctx.addIssue({ code: "custom", path: ["file"], message: "This file is empty." });
          return;
        }
        if (form.file.size > limits.maxFileBytes) {
          ctx.addIssue({
            code: "custom",
            path: ["file"],
            message: `File is too large. The limit is ${formatBytes(limits.maxFileBytes)}.`,
          });
        }
        return;
      }

      if (form.text.trim().length === 0) {
        ctx.addIssue({ code: "custom", path: ["text"], message: "Paste your study guide text." });
        return;
      }
      if (utf8ByteLength(form.text) > limits.maxTextBytes) {
        ctx.addIssue({
          code: "custom",
          path: ["text"],
          message: `Study guide text must be ${formatBytes(limits.maxTextBytes)} or less.`,
        });
      }
    });
}

export type StudyGuideDocumentForm = z.infer<ReturnType<typeof createStudyGuideDocumentFormSchema>>;

/** Returns the first validation message, or null when the form is valid. */
export function validateStudyGuideDocumentForm(
  form: StudyGuideDocumentForm,
  limits: StudyGuideDocumentLimits = DEFAULT_DOCUMENT_LIMITS
): string | null {
  const result = createStudyGuideDocumentFormSchema(limits).safeParse(form);
  if (result.success) return null;
  // Prefer the file/text issue so the user fixes the main input first.
  const issues = result.error.issues;
  const primary = issues.find((issue) => issue.path[0] === "file" || issue.path[0] === "text");
  return (primary ?? issues[0])?.message ?? "Invalid input.";
}

/** Same limits as item creation (AC 2.1); explanation leaves room for the "From <guide>" suffix. */
export const candidateEditSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Question is required.")
    .max(1000, "Question must be 1000 characters or less."),
  correctAnswer: z
    .string()
    .trim()
    .min(1, "Correct answer is required.")
    .max(500, "Correct answer must be 500 characters or less."),
  incorrectAnswers: z
    .array(z.string().trim().min(1, "Wrong answers cannot be empty.").max(500, "Answers must be 500 characters or less."))
    .min(1, "Add at least one wrong answer.")
    .max(4, "Add at most four wrong answers."),
  explanation: z.string().trim().max(3500, "Explanation must be 3500 characters or less."),
});

export type CandidateEdit = z.infer<typeof candidateEditSchema>;

export function validateCandidateEdit(edit: CandidateEdit): string | null {
  const result = candidateEditSchema.safeParse(edit);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid question.");
}
