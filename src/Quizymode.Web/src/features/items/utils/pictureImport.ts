/**
 * Import rejects pictures (#403): curated pictures are added through seed data, never through upload. A missing field
 * or JSON null is accepted (an exported file carries nulls); any other value is a problem the server would also reject.
 */
const PICTURE_FIELDS = ["questionImage", "explanationImage"] as const;
type PictureField = (typeof PICTURE_FIELDS)[number];

const FIX_HINT =
  "Pictures can't be imported. Remove questionImage and explanationImage from your JSON. Curated pictures are added through seed data.";

function quoted(field: PictureField): string {
  return `"${field}"`;
}

function formatItemNumbers(numbers: readonly number[]): string {
  if (numbers.length <= 3) {
    return numbers.length === 1
      ? String(numbers[0])
      : `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
  }
  return `${numbers.slice(0, 3).join(", ")} and ${numbers.length - 3} more`;
}

/** Returns the message to show for an upload that carries pictures, or null when none is present. */
export function findPictureImportError(rows: readonly unknown[]): string | null {
  const offenders: { itemNumber: number; fields: PictureField[] }[] = [];
  rows.forEach((row, index) => {
    if (typeof row !== "object" || row === null) return;
    const record = row as Record<string, unknown>;
    const fields = PICTURE_FIELDS.filter((field) => record[field] !== undefined && record[field] !== null);
    if (fields.length > 0) offenders.push({ itemNumber: index + 1, fields });
  });
  if (offenders.length === 0) return null;

  if (offenders.length === 1) {
    const [{ itemNumber, fields }] = offenders;
    return `Item ${itemNumber} has ${fields.map(quoted).join(" and ")}. ${FIX_HINT}`;
  }

  const found = new Set(offenders.flatMap((offender) => offender.fields));
  const fieldText = PICTURE_FIELDS.filter((field) => found.has(field)).map(quoted).join(" or ");
  return `Items ${formatItemNumbers(offenders.map((offender) => offender.itemNumber))} have ${fieldText}. ${FIX_HINT}`;
}
