"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Mic, MicOff, Volume2 } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

// Minimal SpeechRecognition typings (Web Speech API).
type SR = any;

const EXAMPLES_EN = [
  "Top selling products?",
  "What is my RTO rate?",
  "How much revenue today?",
  "Any festivals coming?",
  "Customers at risk?",
];
const EXAMPLES_BN = [
  "আজ কত বিক্রি হলো?",
  "টপ সেলিং পণ্য কোনটা?",
  "RTO হার কত?",
  "আসন্ন উৎসব কী?",
  "ঝুঁকিতে কতজন ক্রেতা?",
];

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

export function VoiceMic({ locale }: { locale: Locale }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // If bn-BD turns out to be unavailable on this device, we silently fall
  // back to en-US and remember it so we don't keep retrying Bangla.
  const [recogLang, setRecogLang] = useState<"bn-BD" | "en-US">(
    locale === "bn" ? "bn-BD" : "en-US",
  );
  const recognitionRef = useRef<SR | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const rec: SR = new SpeechRecognition();
    rec.lang = recogLang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event: any) => {
      const text: string = event.results[0][0].transcript;
      setHeard(text);
      askServer(text);
    };
    rec.onerror = (e: any) => {
      setListening(false);
      const code: string = e?.error || "";
      // Bangla recognizer missing on this device — switch to English and
      // tell the user once, instead of failing every attempt.
      if (code === "language-not-supported" && rec.lang === "bn-BD") {
        setRecogLang("en-US");
        setError(t("voice.err.bnFallback", locale));
        return;
      }
      const key = recognitionErrorKey(code);
      if (key) setError(t(key, locale));
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    // Re-creating the recognizer when locale or recogLang changes is cheap;
    // we keep the same `recognitionRef` so start/stop bindings stay valid.
    return () => {
      try {
        rec.abort?.();
      } catch {
        /* recognizer might already be torn down */
      }
    };
  }, [locale, recogLang]);

  const start = () => {
    if (!recognitionRef.current) return;
    setHeard("");
    setAnswer("");
    setError("");
    setListening(true);
    try {
      recognitionRef.current.start();
    } catch (e) {
      // .start() throws InvalidStateError if a previous session is still
      // running. Surface it instead of silently snapping back to idle.
      setListening(false);
      setError(t("voice.err.generic", locale));
    }
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const askServer = async (q: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/voice-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, locale }),
      });
      const data: { text?: string; detectedLang?: Locale; error?: string } =
        await res.json().catch(() => ({}));
      if (!res.ok || !data.text) {
        setError(data.error || t("voice.err.server", locale));
        return;
      }
      setAnswer(data.text);
      // Speak the reply if the browser supports TTS.
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          const utter = new SpeechSynthesisUtterance(data.text);
          utter.lang = data.detectedLang === "bn" ? "bn-BD" : "en-US";
          utter.rate = 0.95;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
        } catch {
          /* TTS is a nice-to-have — never fail the answer because of it */
        }
      }
    } catch {
      setError(t("voice.err.server", locale));
    } finally {
      setLoading(false);
    }
  };

  const examples = locale === "bn" ? EXAMPLES_BN : EXAMPLES_EN;

  return (
    <div className="space-y-6">
      {supported === false && (
        <div className="rounded-md bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {t("voice.unsupported", locale)}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 flex flex-col items-center text-center">
        <button
          onClick={listening ? stop : start}
          disabled={supported === false}
          aria-label={listening ? t("voice.listening", locale) : t("voice.tap", locale)}
          className={`relative w-28 h-28 rounded-full grid place-items-center transition shadow-md ${
            listening ? "bg-rose-500 animate-pulse" : "bg-brand-600 hover:bg-brand-700"
          } text-white disabled:opacity-50`}
        >
          {listening ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
        </button>
        <div className="mt-4 text-sm font-medium">
          {listening ? t("voice.listening", locale) : t("voice.tap", locale)}
        </div>
        <div className="mt-1 text-xs text-slate-500">{t("voice.hint", locale)}</div>
        {recogLang === "en-US" && locale === "bn" && (
          <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
            {t("voice.err.bnFallbackTag", locale)}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {(heard || answer || loading) && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          {heard && (
            <div>
              <div className="text-[11px] uppercase text-slate-500">{t("voice.heard", locale)}</div>
              <div className="mt-1">&ldquo;{heard}&rdquo;</div>
            </div>
          )}
          {loading && <div className="text-sm text-slate-500">{t("common.loading", locale)}</div>}
          {answer && (
            <div>
              <div className="text-[11px] uppercase text-slate-500 flex items-center gap-1">
                <Volume2 className="w-3 h-3" /> {t("voice.answer", locale)}
              </div>
              <div className="mt-1 text-slate-900">{answer}</div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="text-sm font-medium mb-2">{t("voice.examples", locale)}</div>
        <div className="flex flex-wrap gap-2">
          {examples.map((q) => (
            <button
              key={q}
              onClick={() => {
                setHeard(q);
                setAnswer("");
                setError("");
                askServer(q);
              }}
              className="text-xs px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-50"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
