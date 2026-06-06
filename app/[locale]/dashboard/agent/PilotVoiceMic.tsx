"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

// Minimal SpeechRecognition typings (Web Speech API).
type SR = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: Array<Array<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

/** Map raw SpeechRecognition error codes to localised, actionable messages. */
function recognitionErrorKey(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "voice.err.permission";
    case "no-speech":
      return "voice.err.noSpeech";
    case "audio-capture":
      return "voice.err.noMic";
    case "network":
      return "voice.err.network";
    case "language-not-supported":
      return "voice.err.langUnsupported";
    case "aborted":
      // User-cancelled — not a real error, surface nothing.
      return "";
    default:
      return "voice.err.generic";
  }
}

interface PilotVoiceMicProps {
  locale: Locale;
  /** Disable the button (e.g. while the chat is waiting on a reply). */
  disabled?: boolean;
  /** Fired with the recognised transcript. The parent decides what to do
   *  with it (the Pilot composer sends it as a chat message). */
  onTranscript: (text: string) => void;
  /** Surface localised STT errors back to the parent so they appear in the
   *  same error slot as chat errors. Empty string clears any prior error. */
  setError: (msg: string) => void;
}

/**
 * Mic button that drops into the Pilot composer. Records one utterance via
 * the browser's Web Speech API and hands the transcript back to the parent
 * via onTranscript. Tries bn-BD first when the UI locale is Bangla, falls
 * back to en-US automatically on devices without a Bangla recogniser
 * (Chrome on Windows/macOS typically lacks one — Android/Chromebook have it).
 *
 * Hidden entirely on browsers that don't expose SpeechRecognition (Firefox,
 * older Safari) so the composer doesn't show a button the user can't use.
 */
export function PilotVoiceMic({ locale, disabled, onTranscript, setError }: PilotVoiceMicProps) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  // If bn-BD turns out to be unavailable on this device, we silently fall
  // back to en-US and remember it so we don't keep retrying Bangla.
  const [recogLang, setRecogLang] = useState<"bn-BD" | "en-US">(
    locale === "bn" ? "bn-BD" : "en-US",
  );
  const recognitionRef = useRef<SR | null>(null);
  // Keep the latest callback prop in a ref so the effect below doesn't have
  // to re-create the recogniser every render. Re-creation tears down a live
  // recogniser session and triggers an "aborted" error on the next attempt.
  const onTranscriptRef = useRef(onTranscript);
  const setErrorRef = useRef(setError);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    setErrorRef.current = setError;
  }, [onTranscript, setError]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SR;
      webkitSpeechRecognition?: new () => SR;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const rec = new Ctor();
    rec.lang = recogLang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const text = event.results[0][0].transcript;
      if (text && text.trim()) onTranscriptRef.current(text.trim());
    };
    rec.onerror = (e) => {
      setListening(false);
      const code = e?.error || "";
      // Bangla recogniser missing on this device — switch to English and
      // tell the user once, instead of failing every attempt.
      if (code === "language-not-supported" && rec.lang === "bn-BD") {
        setRecogLang("en-US");
        setErrorRef.current(t("voice.err.bnFallback", locale));
        return;
      }
      const key = recognitionErrorKey(code);
      if (key) setErrorRef.current(t(key, locale));
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    return () => {
      try {
        rec.abort?.();
      } catch {
        /* recogniser might already be torn down */
      }
    };
  }, [locale, recogLang]);

  const toggle = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      try {
        rec.stop();
      } catch {
        /* recogniser may have already stopped */
      }
      setListening(false);
      return;
    }
    // Starting a new turn cancels any in-flight TTS so the user isn't
    // talking over Pilot's previous answer.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* TTS cancel is best-effort */
      }
    }
    setErrorRef.current("");
    setListening(true);
    try {
      rec.start();
    } catch {
      // .start() throws InvalidStateError if a previous session is still
      // running. Don't leave the UI stuck in "listening" state.
      setListening(false);
      setErrorRef.current(t("voice.err.generic", locale));
    }
  };

  if (supported === false) {
    // No SR support on this browser → omit the button entirely. The Pilot
    // composer's text input still works.
    return null;
  }

  const label = listening ? t("voice.listening", locale) : t("voice.tap", locale);
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || supported === null}
      aria-label={label}
      title={label}
      className={
        "shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md text-white transition disabled:opacity-50 " +
        (listening
          ? "bg-rose-500 hover:bg-rose-600 animate-pulse"
          : "bg-slate-700 hover:bg-slate-800")
      }
    >
      {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );
}
