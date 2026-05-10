"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

// Minimal SpeechRecognition typings (Web Speech API)
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

export function VoiceMic({ locale }: { locale: Locale }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
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
    rec.lang = locale === "bn" ? "bn-BD" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event: any) => {
      const text: string = event.results[0][0].transcript;
      setHeard(text);
      askServer(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
  }, [locale]);

  const start = () => {
    if (!recognitionRef.current) return;
    setHeard("");
    setAnswer("");
    setListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      setListening(false);
    }
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const askServer = async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/voice-query", {
        method: "POST",
        body: JSON.stringify({ q }),
      });
      const data = await res.json();
      setAnswer(data.text);
      // TTS
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const utter = new SpeechSynthesisUtterance(data.text);
        utter.lang = data.detectedLang === "bn" ? "bn-BD" : "en-US";
        utter.rate = 0.95;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      }
    } finally {
      setLoading(false);
    }
  };

  const examples = locale === "bn" ? EXAMPLES_BN : EXAMPLES_EN;

  return (
    <div className="space-y-6">
      {supported === false && (
        <div className="rounded-md bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm">
          {t("voice.unsupported", locale)}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 flex flex-col items-center text-center">
        <button
          onClick={listening ? stop : start}
          disabled={supported === false}
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
      </div>

      {(heard || answer || loading) && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          {heard && (
            <div>
              <div className="text-[11px] uppercase text-slate-500">{t("voice.heard", locale)}</div>
              <div className="mt-1">"{heard}"</div>
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
