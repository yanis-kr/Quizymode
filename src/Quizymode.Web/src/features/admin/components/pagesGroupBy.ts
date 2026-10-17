export type PagesGroupBy = "area" | "scope" | "raw";

export const GROUP_BY_OPTIONS: Array<{ label: string; value: PagesGroupBy }> = [
  { label: "Feature area", value: "area" },
  { label: "Content scope", value: "scope" },
  { label: "Raw URL", value: "raw" },
];
