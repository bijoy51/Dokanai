"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, ShieldAlert, UserMinus, CalendarClock, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * Email Composer card on the Auto-Marketing page.
 *
 * Flow:
 *   1. User picks one of three audiences (VIP / RTO Risk / At-Risk Loyal).
 *   2. The subject + body fields auto-fill with an audience-appropriate
 *      placeholder template that the user can edit freely. The placeholder
 *      ONLY overwrites the fields when they are empty or still equal to the
 *      previous audience's auto-fill — so user edits are never destroyed.
 *   3. User sets a date+time (defaults to "now + 1 day at 6 pm Asia/Dhaka").
 *   4. Schedule button POSTs to /api/marketing/email-campaigns.
 *   5. The scheduled-campaign list is intentionally NOT shown here.
 *
 * Merge tags supported in subject + body: {{name}}, {{shop}}, {{coupon}},
 * {{expires}}. The cron worker substitutes them per recipient at send time.
 */

type AudienceKey = "vip" | "rto" | "atrisk";

interface Template {
  subject: string;
  body: string;
}

const TEMPLATES_EN: Record<AudienceKey, Template> = {
  vip: {
    subject: "A thank-you (and a perk) for our VIP — {{name}}",
    body:
      "Hi {{name}},\n\n" +
      "You are one of {{shop}}'s most valued customers. As a small thank-you, here is an exclusive perk just for you: use code VIP15 for 15% off your next order, valid for 7 days.\n\n" +
      "If you would like a personal recommendation, just reply to this email.\n\n" +
      "Thank you for being with us,\n" +
      "{{shop}}",
  },
  rto: {
    subject: "Confirm your pending order with {{shop}}",
    body:
      "Hi {{name}},\n\n" +
      "We have your order ready to dispatch, but we noticed it is at risk of being returned. To make sure it reaches you, please confirm your delivery details (or pay 50% advance via bKash / Nagad) by replying to this email.\n\n" +
      "Confirmed orders go out the same day. We hold pending confirmations for 48 hours before cancelling.\n\n" +
      "Thank you,\n" +
      "{{shop}}",
  },
  atrisk: {
    subject: "We have missed you, {{name}} — here is 15% off to come back",
    body:
      "Hi {{name}},\n\n" +
      "It has been a little while since your last order at {{shop}}, and we wanted to say hi. To welcome you back, here is 15% off your next purchase: use code BACK15 at checkout. The offer is good for 48 hours.\n\n" +
      "If there is something you have been looking for, just reply and we will see what we can do.\n\n" +
      "See you soon,\n" +
      "{{shop}}",
  },
};

const TEMPLATES_BN: Record<AudienceKey, Template> = {
  vip: {
    subject: "আমাদের VIP-এর জন্য একটু ধন্যবাদ — {{name}}",
    body:
      "প্রিয় {{name}},\n\n" +
      "আপনি {{shop}}-এর সবচেয়ে মূল্যবান কাস্টমারদের একজন। ছোট্ট একটা ধন্যবাদ হিসেবে শুধু আপনার জন্য: VIP15 কোড ব্যবহার করে পরবর্তী অর্ডারে ১৫% ছাড়, ৭ দিন পর্যন্ত বৈধ।\n\n" +
      "পার্সোনাল রেকমেন্ডেশন লাগলে এই ইমেলেই উত্তর দিন।\n\n" +
      "আমাদের সাথে থাকার জন্য ধন্যবাদ,\n" +
      "{{shop}}",
  },
  rto: {
    subject: "{{shop}}-এ আপনার পেন্ডিং অর্ডার নিশ্চিত করুন",
    body:
      "প্রিয় {{name}},\n\n" +
      "আপনার অর্ডার পাঠানোর জন্য প্রস্তুত, তবে এটি ফেরত যাওয়ার ঝুঁকিতে আছে। ডেলিভারি ঠিকঠাক পেতে দয়া করে এই ইমেলে উত্তর দিয়ে ডেলিভারি ডিটেইলস নিশ্চিত করুন (অথবা bKash / Nagad-এ ৫০% অগ্রিম পেমেন্ট করুন)।\n\n" +
      "নিশ্চিত করা অর্ডার একই দিনে পাঠানো হয়। ৪৮ ঘণ্টা অপেক্ষার পর পেন্ডিং অর্ডার বাতিল করা হয়।\n\n" +
      "ধন্যবাদ,\n" +
      "{{shop}}",
  },
  atrisk: {
    subject: "আপনাকে মিস করছি, {{name}} — ফিরে আসুন ১৫% ছাড়ে",
    body:
      "প্রিয় {{name}},\n\n" +
      "{{shop}}-এ আপনার শেষ অর্ডারের পর কিছুদিন হয়ে গেছে। ফিরে আসার জন্য পরবর্তী অর্ডারে ১৫% ছাড় দিচ্ছি — চেকআউটে BACK15 কোড ব্যবহার করুন। অফার ৪৮ ঘণ্টা পর্যন্ত বৈধ।\n\n" +
      "কিছু খুঁজছিলেন? এই ইমেলে উত্তর দিন, আমরা চেষ্টা করব।\n\n" +
      "তাড়াতাড়ি দেখা হবে,\n" +
      "{{shop}}",
  },
};

function defaultSchedule(): string {
  // Tomorrow at 18:00 in the user's local timezone, as a `datetime-local`
  // value (no timezone suffix).
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EmailComposer({ locale }: { locale: Locale }) {
  const [audience, setAudience] = useState<AudienceKey | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledFor, setScheduledFor] = useState(defaultSchedule());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ id: string; scheduledFor: string; reach: { audienceCount: number; withEmail: number; optedIn: number }; sendConfigured: boolean } | null>(null);

  const templates = locale === "bn" ? TEMPLATES_BN : TEMPLATES_EN;

  // Track the auto-filled template so user edits aren't clobbered when they
  // tweak fields then change audience.
  const lastTemplate = useRef<Template | null>(null);

  // When audience changes, fill the form with a fresh template — but only
  // overwrite a field if the user hasn't edited it away from the previous
  // template (or hasn't typed anything yet).
  useEffect(() => {
    if (!audience) return;
    const tpl = templates[audience];
    setSubject((cur) => (cur === "" || cur === lastTemplate.current?.subject ? tpl.subject : cur));
    setBody((cur) => (cur === "" || cur === lastTemplate.current?.body ? tpl.body : cur));
    lastTemplate.current = tpl;
    // intentionally re-fire on locale change so a language switch refreshes
    // an untouched placeholder
  }, [audience, templates]);

  const audienceMeta: Array<{
    key: AudienceKey;
    label: string;
    sublabel: string;
    Icon: typeof Crown;
    tone: string;
  }> = useMemo(
    () => [
      {
        key: "vip",
        label: t("mkt.email.audVip", locale),
        sublabel: t("mkt.email.audVipHint", locale),
        Icon: Crown,
        tone: "amber",
      },
      {
        key: "rto",
        label: t("mkt.email.audRto", locale),
        sublabel: t("mkt.email.audRtoHint", locale),
        Icon: ShieldAlert,
        tone: "rose",
      },
      {
        key: "atrisk",
        label: t("mkt.email.audAtrisk", locale),
        sublabel: t("mkt.email.audAtriskHint", locale),
        Icon: UserMinus,
        tone: "indigo",
      },
    ],
    [locale],
  );

  const submit = async () => {
    setError("");
    setSuccess(null);
    if (!audience) {
      setError(t("mkt.email.errAudience", locale));
      return;
    }
    if (!subject.trim()) {
      setError(t("mkt.email.errSubject", locale));
      return;
    }
    if (!body.trim()) {
      setError(t("mkt.email.errBody", locale));
      return;
    }
    if (!scheduledFor) {
      setError(t("mkt.email.errSchedule", locale));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/marketing/email-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience, subject, body, scheduledFor }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("mkt.email.errGeneric", locale));
        return;
      }
      setSuccess(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("mkt.email.errGeneric", locale));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForNew = () => {
    setSuccess(null);
    setSubject("");
    setBody("");
    setAudience(null);
    lastTemplate.current = null;
    setScheduledFor(defaultSchedule());
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 mb-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Send className="w-4 h-4 text-brand-600" />
          {t("mkt.email.title", locale)}
        </h2>
        <p className="text-xs text-slate-500 mt-1">{t("mkt.email.subtitle", locale)}</p>
      </div>

      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-2 text-emerald-800">
            <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-medium">{t("mkt.email.scheduled", locale)}</div>
              <div className="text-sm text-emerald-700 mt-1">
                {t("mkt.email.scheduledFor", locale)}{" "}
                <span className="font-mono">{new Date(success.scheduledFor).toLocaleString()}</span>
              </div>
              <div className="text-sm text-emerald-700 mt-1">
                {t("mkt.email.reachLine", locale)}{" "}
                <strong>{success.reach.optedIn}</strong> / {success.reach.audienceCount}{" "}
                <span className="text-emerald-600">
                  ({success.reach.withEmail} {t("mkt.email.withEmail", locale)})
                </span>
              </div>
              {!success.sendConfigured && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-2">
                  {t("mkt.email.providerMissing", locale)}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={resetForNew}
              className="inline-flex items-center gap-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-md px-4 py-2"
            >
              {t("mkt.email.composeAnother", locale)}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Audience picker */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            {audienceMeta.map((a) => {
              const active = audience === a.key;
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setAudience(a.key)}
                  className={
                    "text-left rounded-lg border px-3 py-2.5 transition-colors " +
                    (active
                      ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100"
                      : "border-slate-200 bg-white hover:bg-slate-50")
                  }
                >
                  <div className="flex items-center gap-2">
                    <a.Icon className={"w-4 h-4 " + (active ? "text-brand-700" : "text-slate-500")} />
                    <span className={"text-sm font-medium " + (active ? "text-brand-900" : "text-slate-800")}>
                      {a.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{a.sublabel}</div>
                </button>
              );
            })}
          </div>

          {/* Subject */}
          <div className="mb-3">
            <label className="text-xs text-slate-500 block mb-1">{t("mkt.email.subjectLabel", locale)}</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={!audience}
              placeholder={
                audience
                  ? templates[audience].subject
                  : t("mkt.email.pickAudienceFirst", locale)
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>

          {/* Body */}
          <div className="mb-3">
            <label className="text-xs text-slate-500 block mb-1">{t("mkt.email.bodyLabel", locale)}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={!audience}
              rows={10}
              placeholder={
                audience
                  ? templates[audience].body
                  : t("mkt.email.pickAudienceFirst", locale)
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
            <p className="text-[11px] text-slate-400 mt-1">{t("mkt.email.mergeTagsHint", locale)}</p>
          </div>

          {/* Schedule + send */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="text-xs text-slate-500 block mb-1 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" />
                {t("mkt.email.scheduleLabel", locale)}
              </label>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                disabled={!audience}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !audience}
              className="inline-flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t("mkt.email.schedule", locale)}
            </button>
          </div>

          {error && (
            <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </>
      )}
    </section>
  );
}
