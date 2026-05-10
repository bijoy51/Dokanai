"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n/messages";
import { Megaphone, Send, Clock } from "lucide-react";

type Audience = "all" | "dormant" | "vip" | "atrisk";
type Goal = "winback" | "upsell" | "festival";
type Channel = "whatsapp" | "sms" | "messenger";

export function MarketingComposer({
  locale,
  counts,
}: {
  locale: Locale;
  counts: { all: number; dormant: number; vip: number; atrisk: number };
}) {
  const [audience, setAudience] = useState<Audience>("dormant");
  const [goal, setGoal] = useState<Goal>("winback");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [preview, setPreview] = useState<{ body: string; cta: string; bestHour: string; count: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [scheduled, setScheduled] = useState(false);

  const generate = async () => {
    setLoading(true);
    setScheduled(false);
    const res = await fetch("/api/marketing", {
      method: "POST",
      body: JSON.stringify({ audience, goal, channel }),
    });
    const data = await res.json();
    const body =
      locale === "bn"
        ? data.bodyBn
            .replaceAll("{{name}}", "রাশিদা")
            .replaceAll("{{shop}}", "আপনার দোকান")
        : data.bodyEn
            .replaceAll("{{name}}", "Rashida")
            .replaceAll("{{shop}}", "Your Shop");
    const cta = locale === "bn" ? data.ctaBn : data.cta;
    // best send hour (cohort heuristic)
    const hours = audience === "vip" ? "8:00 PM" : audience === "dormant" ? "7:30 PM" : "9:00 PM";
    setPreview({ body, cta, bestHour: hours, count: data.count });
    setLoading(false);
  };

  const audienceOptions: { value: Audience; label: string; n: number }[] = [
    { value: "all", label: t("mkt.audience.all", locale), n: counts.all },
    { value: "vip", label: t("mkt.audience.vip", locale), n: counts.vip },
    { value: "dormant", label: t("mkt.audience.dormant", locale), n: counts.dormant },
    { value: "atrisk", label: t("mkt.audience.atrisk", locale), n: counts.atrisk },
  ];

  const goalOptions: { value: Goal; label: string }[] = [
    { value: "winback", label: t("mkt.goal.winback", locale) },
    { value: "upsell", label: t("mkt.goal.upsell", locale) },
    { value: "festival", label: t("mkt.goal.festival", locale) },
  ];

  const channelOptions: { value: Channel; label: string }[] = [
    { value: "whatsapp", label: t("mkt.channel.whatsapp", locale) },
    { value: "sms", label: t("mkt.channel.sms", locale) },
    { value: "messenger", label: t("mkt.channel.messenger", locale) },
  ];

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-5">
        <div>
          <label className="text-xs uppercase text-slate-500">{t("mkt.audience", locale)}</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {audienceOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => setAudience(o.value)}
                className={`text-left rounded-md border p-2 ${
                  audience === o.value ? "border-brand-500 bg-brand-50" : "border-slate-200"
                }`}
              >
                <div className="text-sm font-medium">{o.label}</div>
                <div className="text-[11px] text-slate-500">{o.n} customers</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs uppercase text-slate-500">{t("mkt.goal", locale)}</label>
          <div className="mt-2 inline-flex border border-slate-200 rounded-md overflow-hidden text-sm">
            {goalOptions.map((g, i) => (
              <button
                key={g.value}
                onClick={() => setGoal(g.value)}
                className={`px-3 py-1.5 ${i > 0 ? "border-l border-slate-200" : ""} ${
                  goal === g.value ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs uppercase text-slate-500">{t("mkt.channel", locale)}</label>
          <div className="mt-2 inline-flex border border-slate-200 rounded-md overflow-hidden text-sm">
            {channelOptions.map((c, i) => (
              <button
                key={c.value}
                onClick={() => setChannel(c.value)}
                className={`px-3 py-1.5 ${i > 0 ? "border-l border-slate-200" : ""} ${
                  channel === c.value ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60"
        >
          <Megaphone className="w-4 h-4" />
          {loading ? t("common.loading", locale) : t("mkt.generate", locale)}
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="text-sm font-medium mb-3">{t("mkt.preview", locale)}</div>
        {!preview && (
          <div className="text-sm text-slate-500">
            {locale === "bn" ? "বার্তা তৈরি করতে ক্লিক করুন।" : "Click Generate to create a message."}
          </div>
        )}
        {preview && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
              <div className="text-sm whitespace-pre-wrap">{preview.body}</div>
              <div className="mt-3 inline-flex items-center text-xs px-3 py-1 rounded-full bg-brand-600 text-white">
                {preview.cta}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-slate-200 p-3">
                <div className="text-[11px] uppercase text-slate-500">{t("mkt.bestHour", locale)}</div>
                <div className="mt-1 font-medium flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-brand-600" /> {preview.bestHour}
                </div>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <div className="text-[11px] uppercase text-slate-500">Audience</div>
                <div className="mt-1 font-medium">{preview.count} customers</div>
              </div>
            </div>
            <button
              onClick={() => setScheduled(true)}
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              <Send className="w-4 h-4" /> {t("mkt.send", locale)}
            </button>
            {scheduled && (
              <div className="text-sm text-brand-700 bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
                ✓ {t("mkt.sentToast", locale)}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
