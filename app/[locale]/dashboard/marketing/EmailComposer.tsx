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

// Persistence: each audience+locale combination keeps its own subject + body
// in localStorage so editing the VIP template, then switching to RTO Risk,
// then back to VIP, restores your VIP edits exactly. Three audiences =
// three independent template "drafts" the user can mutate freely.

const STORAGE_PREFIX = "dokanai:email-template";

function templateKey(a: AudienceKey, locale: Locale): string {
  return `${STORAGE_PREFIX}:${a}:${locale}`;
}

function loadSaved(a: AudienceKey, locale: Locale): Template | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(templateKey(a, locale));
    if (!raw) return null;
    const obj = JSON.parse(raw) as Partial<Template>;
    if (obj && typeof obj.subject === "string" && typeof obj.body === "string") {
      return { subject: obj.subject, body: obj.body };
    }
  } catch {
    /* corrupt entry — fall through to default */
  }
  return null;
}

function saveDraft(a: AudienceKey, locale: Locale, draft: Template): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(templateKey(a, locale), JSON.stringify(draft));
  } catch {
    /* quota or disabled — non-fatal, just won't survive a reload */
  }
}

export interface ScheduledNotice {
  id: string;
  audience: AudienceKey;
  scheduledFor: string;
  reach: { audienceCount: number; withEmail: number; optedIn: number };
  sendConfigured: boolean;
}

export function EmailComposer({
  locale,
  onScheduled,
}: {
  locale: Locale;
  /** Called after a successful schedule so the parent (the tabbed wrapper)
   *  can nudge the user toward the Scheduled tab. */
  onScheduled?: (n: ScheduledNotice) => void;
}) {
  const [audience, setAudience] = useState<AudienceKey | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledFor, setScheduledFor] = useState(defaultSchedule());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [lastScheduled, setLastScheduled] = useState<ScheduledNotice | null>(null);

  const templates = locale === "bn" ? TEMPLATES_BN : TEMPLATES_EN;

  // When audience (or locale) changes, hydrate the form from the saved draft
  // for that combo, falling back to the canned placeholder if there is none.
  useEffect(() => {
    if (!audience) return;
    const saved = loadSaved(audience, locale);
    const tpl = templates[audience];
    setSubject(saved?.subject ?? tpl.subject);
    setBody(saved?.body ?? tpl.body);
  }, [audience, locale, templates]);

  // Direct write to localStorage on every keystroke (small payload, sync).
  // Calling these from the input onChange handlers keeps the persistence
  // logic out of effects (which would otherwise overwrite the *other*
  // audience's draft on the render right after a switch).
  const editSubject = (v: string) => {
    setSubject(v);
    if (audience) saveDraft(audience, locale, { subject: v, body });
  };
  const editBody = (v: string) => {
    setBody(v);
    if (audience) saveDraft(audience, locale, { subject, body: v });
  };

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
    setLastScheduled(null);
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
      const notice: ScheduledNotice = {
        id: data.id,
        audience,
        scheduledFor: data.scheduledFor ?? scheduledFor,
        reach: data.reach ?? { audienceCount: 0, withEmail: 0, optedIn: 0 },
        sendConfigured: !!data.sendConfigured,
      };
      setLastScheduled(notice);
      onScheduled?.(notice);
      // Per spec: the user can schedule all three audiences in one
      // session. Keep their drafts intact; just clear the current
      // selection so the form invites the next pick. The drafts
      // themselves remain in localStorage.
      setAudience(null);
      setSubject("");
      setBody("");
      setScheduledFor(defaultSchedule());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("mkt.email.errGeneric", locale));
    } finally {
      setSubmitting(false);
    }
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

      {lastScheduled && (
        // Banner above the form — confirms the schedule but keeps the form
        // open so the user can immediately schedule the next audience.
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-start gap-2 text-emerald-800">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-medium">
                {t("mkt.email.scheduled", locale)}{" "}
                <span className="text-xs text-emerald-700">
                  ({t(`mkt.email.aud${lastScheduled.audience === "vip" ? "Vip" : lastScheduled.audience === "rto" ? "Rto" : "Atrisk"}`, locale)})
                </span>
              </div>
              <div className="text-emerald-700 mt-0.5">
                {t("mkt.email.scheduledFor", locale)}{" "}
                <span className="font-mono">{new Date(lastScheduled.scheduledFor).toLocaleString()}</span>
                {"  ·  "}
                <strong>{lastScheduled.reach.optedIn}</strong> / {lastScheduled.reach.audienceCount}{" "}
                <span className="text-emerald-600">
                  ({lastScheduled.reach.withEmail} {t("mkt.email.withEmail", locale)})
                </span>
              </div>
              {!lastScheduled.sendConfigured && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-2">
                  {t("mkt.email.providerMissing", locale)}
                </div>
              )}
              <div className="text-xs text-emerald-700 mt-1">{t("mkt.email.seeScheduledTab", locale)}</div>
            </div>
            <button
              type="button"
              onClick={() => setLastScheduled(null)}
              className="text-emerald-700 hover:text-emerald-900 text-lg leading-none px-1"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {(
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
              onChange={(e) => editSubject(e.target.value)}
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
              onChange={(e) => editBody(e.target.value)}
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
