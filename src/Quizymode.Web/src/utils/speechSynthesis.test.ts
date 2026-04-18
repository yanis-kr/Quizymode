import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSpeechUtterances,
  isSpeechSynthesisSupported,
  speakText,
  stopSpeaking,
} from "./speechSynthesis";

const makeSpeechMock = () => ({
  cancel: vi.fn(),
  speak: vi.fn(),
  getVoices: vi.fn(() => []),
  addEventListener: vi.fn(),
  speaking: false,
  pending: false,
  paused: false,
});

describe("isSpeechSynthesisSupported", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when both APIs are present", () => {
    Object.defineProperty(window, "speechSynthesis", {
      value: makeSpeechMock(),
      configurable: true,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {},
      configurable: true,
    });
    expect(isSpeechSynthesisSupported()).toBe(true);
  });

  it("returns false when speechSynthesis is absent", () => {
    const win = window as unknown as Record<string, unknown>;
    const original = win.speechSynthesis;
    delete win.speechSynthesis;
    expect(isSpeechSynthesisSupported()).toBe(false);
    win.speechSynthesis = original;
  });

  it("returns false when SpeechSynthesisUtterance is absent", () => {
    Object.defineProperty(window, "speechSynthesis", {
      value: makeSpeechMock(),
      configurable: true,
    });
    const win = window as unknown as Record<string, unknown>;
    const original = win.SpeechSynthesisUtterance;
    delete win.SpeechSynthesisUtterance;
    expect(isSpeechSynthesisSupported()).toBe(false);
    win.SpeechSynthesisUtterance = original;
  });
});

describe("createSpeechUtterances", () => {
  beforeEach(() => {
    Object.defineProperty(window, "speechSynthesis", {
      value: makeSpeechMock(),
      configurable: true,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        text: string;
        lang = "";
        voice?: SpeechSynthesisVoice;

        constructor(text: string) {
          this.text = text;
        }
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("splits foreign phrase markup into a speech queue", () => {
    const utterances = createSpeechUtterances(
      "What does '{{ja-JP|こんにちは|konnichiwa|kon-NEE-chee-wah}}' mean?"
    );

    expect(utterances).toHaveLength(3);
    expect(utterances.map((utterance) => utterance.text)).toEqual([
      "What does '",
      "kon-NEE-chee-wah",
      "' mean?",
    ]);
    expect(utterances[1].text).not.toContain("ja-JP");
  });
});

describe("speakText", () => {
  let cancelMock: ReturnType<typeof vi.fn>;
  let speakMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cancelMock = vi.fn();
    speakMock = vi.fn();
    Object.defineProperty(window, "speechSynthesis", {
      value: { cancel: cancelMock, speak: speakMock },
      configurable: true,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        text: string;
        constructor(text: string) {
          this.text = text;
        }
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cancels existing speech then speaks", () => {
    speakText("Hello world");
    expect(cancelMock).toHaveBeenCalledOnce();
    expect(speakMock).toHaveBeenCalledOnce();
  });

  it("cancels without restarting when the same text is already playing", () => {
    const speechSynthesisMock = window.speechSynthesis as SpeechSynthesis;

    speakText("Hello world");
    Object.assign(speechSynthesisMock, { speaking: true });

    speakText("Hello world");

    expect(cancelMock).toHaveBeenCalledTimes(2);
    expect(speakMock).toHaveBeenCalledOnce();
  });

  it("passes trimmed text to the utterance", () => {
    speakText("  hello  ");
    const utterance = speakMock.mock.calls[0][0];
    expect(utterance.text).toBe("hello");
  });

  it("speaks parsed foreign phrases without reading markup", () => {
    speakText("What does '{{ja-JP|こんにちは|konnichiwa|kon-NEE-chee-wah}}' mean?");

    expect(speakMock).toHaveBeenCalledTimes(3);
    expect(speakMock.mock.calls.map(([utterance]) => utterance.text)).toEqual([
      "What does '",
      "kon-NEE-chee-wah",
      "' mean?",
    ]);
  });

  it("is a no-op when API is not available", () => {
    const win = window as unknown as Record<string, unknown>;
    delete win.speechSynthesis;
    speakText("Should not crash");
    expect(cancelMock).not.toHaveBeenCalled();
    expect(speakMock).not.toHaveBeenCalled();
  });
});

describe("stopSpeaking", () => {
  let cancelMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cancelMock = vi.fn();
    Object.defineProperty(window, "speechSynthesis", {
      value: { cancel: cancelMock, speak: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {},
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls cancel when supported", () => {
    stopSpeaking();
    expect(cancelMock).toHaveBeenCalledOnce();
  });

  it("is a no-op when API is not available", () => {
    const win = window as unknown as Record<string, unknown>;
    delete win.speechSynthesis;
    expect(() => stopSpeaking()).not.toThrow();
    expect(cancelMock).not.toHaveBeenCalled();
  });
});
