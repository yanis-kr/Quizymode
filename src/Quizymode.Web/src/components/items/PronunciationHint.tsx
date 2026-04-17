import type { ItemSpeechSupport } from "@/types/api";
import { getPronunciationHint } from "@/utils/itemSpeech";

interface PronunciationHintProps {
  text: string;
  speech?: ItemSpeechSupport | null;
  className?: string;
}

export function PronunciationHint({
  text,
  speech,
  className = "mt-1 text-sm text-gray-500 italic",
}: PronunciationHintProps) {
  const pronunciation = getPronunciationHint(text, speech);

  if (!pronunciation) {
    return null;
  }

  return <p className={className}>{pronunciation}</p>;
}
