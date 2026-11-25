/** Limits for the "Photos or scan" input (#748, AC 6.6.44 to 6.6.46). Recognition runs in the browser. */
export const PHOTO_OCR_LIMITS = {
  maxImages: 20,
  maxImageBytes: 10 * 1024 * 1024,
  maxLongSide: 2000,
  pageTimeoutMs: 60_000,
  idleTerminateMs: 120_000,
} as const;

export const PHOTO_OCR_ACCEPT = "image/jpeg,image/png,image/heic,image/heif";
export const OCR_FILE_ACCEPT = `${PHOTO_OCR_ACCEPT},application/pdf,.pdf`;
export const PDF_PAGE_LIMIT = 20;

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function validateOcrSelection(
  files: readonly File[],
  maxFileBytes: number,
): string | null {
  const pdfs = files.filter(isPdf);
  if (pdfs.length && (pdfs.length > 1 || files.length > 1))
    return "Choose photos or one PDF at a time.";
  if (pdfs.length) {
    return pdfs[0].size > maxFileBytes
      ? `This PDF is ${pdfs[0].size.toLocaleString()} bytes; the limit is ${maxFileBytes.toLocaleString()}.`
      : null;
  }
  return validatePhotoSelection(files);
}

const SUPPORTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);

/** Returns a message for the first problem with the selection, or null when every photo may be recognized. */
export function validatePhotoSelection(files: readonly File[]): string | null {
  if (files.length === 0) return "Choose at least one photo.";
  if (files.length > PHOTO_OCR_LIMITS.maxImages) {
    return `Choose up to ${PHOTO_OCR_LIMITS.maxImages} photos at a time. You chose ${files.length}.`;
  }
  for (const file of files) {
    if (
      (!file.type && !/\.(jpe?g|png|heic|heif)$/i.test(file.name)) ||
      (file.type && !SUPPORTED_TYPES.has(file.type))
    ) {
      return `${file.name} is not a JPEG or PNG photo. Only JPEG and PNG photos are supported.`;
    }
    if (file.size > PHOTO_OCR_LIMITS.maxImageBytes) {
      return `${file.name} is over 10 MB. Choose a smaller photo.`;
    }
  }
  return null;
}

/** Shown for one photo that cannot be decoded or recognized; the other photos still go through. */
export function photoReadFailureMessage(fileName: string): string {
  return `${fileName} could not be read. Try a JPEG or PNG photo, or type the text instead.`;
}
