import fs from "node:fs/promises";
import path from "node:path";

type OcrFixture = "clean.png" | "exif-rotated.jpg" | "low-contrast.png" | "scanned.pdf" | "sideways.jpg";

export function ocrFixture(name: OcrFixture): string {
  return path.resolve("playwright/fixtures/study-guide-ocr", name);
}

export async function ocrFile(name: OcrFixture) {
  const mimeType = name.endsWith(".png") ? "image/png" : name.endsWith(".jpg") ? "image/jpeg" : "application/pdf";
  return { name, mimeType, buffer: await fs.readFile(ocrFixture(name)) };
}

const goldenText = "River currents carry fine sediment downstream. Water slows when it enters a lake. Sand settles before smaller particles.";
export const cleanScanSample = /River currents carry fine sediment downstream/i;

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+/g) ?? [];
}

/** Compare corresponding words in order, allowing punctuation, case and line wrap differences. */
export function goldenWordAccuracy(text: string): number {
  const expected = words(goldenText);
  const actual = words(text);
  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let i = 0; i < expected.length; i += 1) {
    const current = [i + 1];
    for (let j = 1; j <= actual.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + Number(expected[i] !== actual[j - 1]));
    }
    previous = current;
  }
  return 1 - previous[actual.length] / expected.length;
}
