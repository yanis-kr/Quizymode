import type { StudyGuideCandidate, StudyGuideDocument, StudyGuideSection } from "@/api/studyGuideDocuments";

/** Poll interval while any section is queued or generating. */
export const STUDY_GUIDE_POLL_INTERVAL_MS = 3000;
/** API limit for one generate call. */
export const MAX_SECTIONS_PER_GENERATE = 50;
/** API limit for one accept call. */
export const MAX_CANDIDATES_PER_ACCEPT = 200;

export type SectionChipKind = "new" | "free" | "queued" | "generating" | "done" | "failed" | "expired";

export interface SectionChip {
  kind: SectionChipKind;
  label: string;
  className: string;
}

const CHIP_STYLES: Record<SectionChipKind, string> = {
  new: "border-slate-300 bg-white text-slate-700",
  free: "border-emerald-300 bg-emerald-50 text-emerald-800",
  queued: "border-amber-300 bg-amber-50 text-amber-800",
  generating: "border-indigo-300 bg-indigo-50 text-indigo-800",
  done: "border-green-300 bg-green-50 text-green-800",
  failed: "border-red-300 bg-red-50 text-red-800",
  expired: "border-gray-300 bg-gray-100 text-gray-600",
};

const CHIP_LABELS: Record<SectionChipKind, string> = {
  new: "New",
  free: "Ready, free",
  queued: "Queued",
  generating: "Generating",
  done: "Done",
  failed: "Failed",
  expired: "Expired",
};

export function getSectionChipKind(section: StudyGuideSection): SectionChipKind {
  switch (section.status) {
    case "Generated":
      return section.cached ? "free" : "done";
    case "Queued":
      return "queued";
    case "Processing":
      return "generating";
    case "Failed":
      return section.textExpired ? "expired" : "failed";
    default:
      return section.textExpired ? "expired" : "new";
  }
}

export function getSectionChip(section: StudyGuideSection): SectionChip {
  const kind = getSectionChipKind(section);
  return { kind, label: CHIP_LABELS[kind], className: CHIP_STYLES[kind] };
}

/** A section can be (re)submitted for generation when it is new or failed and its text is still kept. */
export function isSectionSelectable(section: StudyGuideSection): boolean {
  return !section.textExpired && (section.status === "New" || section.status === "Failed");
}

export function isSectionActive(section: StudyGuideSection): boolean {
  return section.status === "Queued" || section.status === "Processing";
}

export function hasActiveGeneration(document: StudyGuideDocument | undefined): boolean {
  return !!document?.sections.some(isSectionActive);
}

/**
 * Initial picker selection: the first sections that were never processed, in document order,
 * up to the sections left today. Generated (including cached) sections are never selected, so
 * they never count against the quota.
 */
export function computePreselection(document: StudyGuideDocument): Set<string> {
  const limit = Math.max(0, Math.min(document.quota.remainingToday, MAX_SECTIONS_PER_GENERATE));
  const ids = [...document.sections]
    .sort((a, b) => a.index - b.index)
    .filter((section) => !section.textExpired && section.status === "New")
    .slice(0, limit)
    .map((section) => section.id);
  return new Set(ids);
}

/** Keeps only ids that are still selectable (statuses change while polling). */
export function pruneSelection(document: StudyGuideDocument, selection: Set<string>): Set<string> {
  const selectable = new Set(document.sections.filter(isSectionSelectable).map((section) => section.id));
  return new Set([...selection].filter((id) => selectable.has(id)));
}

export function countGeneratedSections(document: StudyGuideDocument): number {
  return document.sections.filter((section) => section.status === "Generated").length;
}

/**
 * Whole minutes until the latest queued free-tier job may start, relative to `nowMs`;
 * null when nothing is waiting.
 */
export function getFreeTierWaitMinutes(document: StudyGuideDocument, nowMs: number): number | null {
  if (document.quota.tier !== "Free") return null;
  const waits = document.sections
    .filter((section) => section.status === "Queued" && section.notBeforeUtc)
    .map((section) => Date.parse(section.notBeforeUtc as string) - nowMs)
    .filter((ms) => Number.isFinite(ms) && ms > 0);
  if (waits.length === 0) return null;
  return Math.max(1, Math.ceil(Math.max(...waits) / 60_000));
}

export function describeSectionPages(section: StudyGuideSection): string | null {
  if (section.pageStart == null) return null;
  if (section.pageEnd == null || section.pageEnd === section.pageStart) return `p. ${section.pageStart}`;
  return `pp. ${section.pageStart}–${section.pageEnd}`;
}

export function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export function formatSourceLocation(candidate: StudyGuideCandidate, sectionLabel: string): string {
  return candidate.page != null ? `p. ${candidate.page}` : sectionLabel;
}
