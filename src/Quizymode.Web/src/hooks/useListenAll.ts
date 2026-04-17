import { useState, useRef, useEffect, useCallback } from "react";
import { createSpeechUtterance, isSpeechSynthesisSupported } from "@/utils/speechSynthesis";
import type { ItemSpeechSupport } from "@/types/api";

interface ListenItem {
  question: string;
  questionSpeech?: ItemSpeechSupport | null;
  correctAnswer: string;
  correctAnswerSpeech?: ItemSpeechSupport | null;
}

export type ListenAllState = "idle" | "playing" | "paused";

/**
 * Sequences TTS playback of all items: speaks the question, pauses 2 seconds,
 * then speaks the answer, then moves on to the next item.
 * Supports pause/resume. Cancels cleanly on unmount.
 */
export function useListenAll(items: ListenItem[]) {
  const [listenState, setListenState] = useState<ListenAllState>("idle");
  const [currentIndex, setCurrentIndex] = useState(0);

  const indexRef = useRef(0);
  const stateRef = useRef<ListenAllState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakNextRef = useRef<() => void>(() => {});

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopAll = useCallback(() => {
    clearTimer();
    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    stateRef.current = "idle";
    setListenState("idle");
    indexRef.current = 0;
    setCurrentIndex(0);
  }, [clearTimer]);

  // Reassigned every render so the closure always captures latest `items` and `stopAll`
  speakNextRef.current = () => {
    const idx = indexRef.current;
    if (idx >= items.length) {
      stopAll();
      return;
    }
    if (stateRef.current !== "playing") return;
    if (!isSpeechSynthesisSupported()) {
      stopAll();
      return;
    }

    setCurrentIndex(idx);
    const item = items[idx];

    const questionUtterance = createSpeechUtterance({
      text: item.question,
      pronunciation: item.questionSpeech?.pronunciation,
      languageCode: item.questionSpeech?.languageCode,
    });
    if (!questionUtterance) {
      indexRef.current = idx + 1;
      speakNextRef.current();
      return;
    }

    questionUtterance.onend = () => {
      if (stateRef.current !== "playing") return;
      // 2-second pause between question and answer
      timerRef.current = setTimeout(() => {
        if (stateRef.current !== "playing") return;
        const answerUtterance = createSpeechUtterance({
          text: item.correctAnswer,
          pronunciation: item.correctAnswerSpeech?.pronunciation,
          languageCode: item.correctAnswerSpeech?.languageCode,
        });
        if (!answerUtterance) {
          indexRef.current = idx + 1;
          timerRef.current = setTimeout(() => speakNextRef.current(), 800);
          return;
        }

        answerUtterance.onend = () => {
          if (stateRef.current !== "playing") return;
          indexRef.current = idx + 1;
          // Brief gap before next item
          timerRef.current = setTimeout(() => speakNextRef.current(), 800);
        };
        window.speechSynthesis.speak(answerUtterance);
      }, 2000);
    };

    window.speechSynthesis.speak(questionUtterance);
  };

  const start = useCallback(() => {
    if (!isSpeechSynthesisSupported()) return;
    clearTimer();
    window.speechSynthesis.cancel();
    indexRef.current = 0;
    stateRef.current = "playing";
    setListenState("playing");
    speakNextRef.current();
  }, [clearTimer]);

  const pause = useCallback(() => {
    clearTimer();
    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    stateRef.current = "paused";
    setListenState("paused");
  }, [clearTimer]);

  const resume = useCallback(() => {
    if (!isSpeechSynthesisSupported()) return;
    stateRef.current = "playing";
    setListenState("playing");
    speakNextRef.current();
  }, []);

  const handleButton = useCallback(() => {
    const s = stateRef.current;
    if (s === "idle") start();
    else if (s === "playing") pause();
    else resume();
  }, [start, pause, resume]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    };
  }, []);

  return {
    listenState,
    currentIndex,
    handleButton,
    stop: stopAll,
    isSupported: isSpeechSynthesisSupported(),
  };
}
