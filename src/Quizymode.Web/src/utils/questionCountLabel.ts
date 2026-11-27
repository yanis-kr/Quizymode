/** "1 question" / "N questions" (#922). `shown` is the number as displayed, e.g. with thousands separators. */
export function questionCountLabel(count: number, shown: string = String(count)): string {
  return `${shown} ${count === 1 ? "question" : "questions"}`;
}
