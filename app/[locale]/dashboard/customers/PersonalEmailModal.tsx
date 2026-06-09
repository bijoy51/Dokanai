"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail, Send, X } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * Per-customer one-shot email modal — fired from the Customers table action
 * buttons ("Thank you" / "Upsell" / "Send coupon").
 *
 * The modal is intentionally NOT the same surface as the bulk campaign
 * composer:
 *   - This is a 1:1 send. The operator wants to write to ONE person right
 *     now and see whether it arrived.
 *   - There is no scheduling. We POST to /api/customers/personal-email and
 *     the email goes out synchronously.
 *   - The recipient field is editable. If the customer record has no email
 *     (e.g. walk-ins), the modal still opens with a blank `to` field so
 *     the operator can type one in manually.
 *
 * Template defaults are inlined here (not imported from EmailComposer)
 * because the bulk composer's three audiences (vip / rto / atrisk) don't
 * map 1:1 to these per-customer actions. Keeping the inline templates
 * short and free of merge tags the operator hasn't seen — only {{name}}
 * and {{shop}}, both pre-substituted before display.
 */

export type PersonalAction = "thank" | "upsell" | "coupon";

interface Template {
  subject: string;
  body: string;
}

const TEMPLATES_EN: Record<PersonalAction, Template> = {
  thank: {
    subject: "Thank you, {{name}} — from {{shop}}",
    body:
      "Hi {{name}},\n\n" +
      "Just a quick thank-you for being one of {{shop}}'s most loyal customers. We genuinely appreciate every order you place with us.\n\n" +
      "If there's ever anything specific you're looking for, just reply to this email and we'll get back to you personally.\n\n" +
      "With gratitude,\n{{shop}}",
  },
  upsell: {
    subject: "A handpicked recommendation for you, {{name}}",
    body:
      "Hi {{name}},\n\n" +
      "Based on what you've ordered before, we think you'll love a few new arrivals at {{shop}}. Reply to this email and we'll send you a curated shortlist with prices.\n\n" +
      "Use code MORE10 for 10% off your next order — good for 7 days.\n\n" +
      "Talk soon,\n{{shop}}",
  },
  coupon: {
    subject: "We've missed you, {{name}} — 15% off to come back",
    body:
      "Hi {{name}},\n\n" +
      "It's been a little while since your last order at {{shop}}. Here's 15% off your next purchase — use code BACK15 at checkout. The offer is good for 48 hours.\n\n" +
      "If there's something you've been looking for, just reply and we'll see what we can do.\n\n" +
      "See you soon,\n{{shop}}",
  },
};

const TEMPLATES_BN: Record<PersonalAction, Template> = {
  thank: {
    subject: "ধন্যবাদ {{name}} — {{shop}} থেকে",
    body:
      "প্রিয় {{name}},\n\n" +
      "{{shop}}-এর সবচেয়ে অনুগত কাস্টমারদের একজন হওয়ার জন্য একটু ধন্যবাদ বলতে চাই। আপনার প্রতিটি অর্ডার আমাদের কাছে মূল্যবান।\n\n" +
      "বিশেষ কিছু খুঁজছেন? এই ইমেলেই উত্তর দিন, আমরা ব্যক্তিগতভাবে যোগাযোগ করব।\n\n" +
      "কৃতজ্ঞতা সহকারে,\n{{shop}}",
  },
  upsell: {
    subject: "আপনার জন্য বাছাই করা একটা সাজেশন, {{name}}",
    body:
      "প্রিয় {{name}},\n\n" +
      "আপনার আগের অর্ডারের ভিত্তিতে {{shop}}-এর কিছু নতুন কালেকশন পছন্দ হবে বলে মনে করি। উত্তর দিলে দাম সহ একটা সংক্ষিপ্ত তালিকা পাঠাব।\n\n" +
      "পরবর্তী অর্ডারে ১০% ছাড়ের জন্য MORE10 কোড ব্যবহার করুন — ৭ দিন বৈধ।\n\n" +
      "শীঘ্রই কথা হবে,\n{{shop}}",
  },
  coupon: {
    subject: "আপনাকে মিস করছি {{name}} — ১৫% ছাড়ে ফিরে আসুন",
    body:
      "প্রিয় {{name}},\n\n" +
      "{{shop}}-এ আপনার শেষ অর্ডারের পর কিছুদিন হয়ে গেছে। পরবর্তী অর্ডারে ১৫% ছাড় দিচ্ছি — চেকআউটে BACK15 কোড ব্যবহার করুন। অফার ৪৮ ঘণ্টা বৈধ।\n\n" +
      "কিছু খুঁজছিলেন? উত্তর দিন, আমরা চেষ্টা করব।\n\n" +
      "তাড়াতাড়ি দেখা হবে,\n{{shop}}",
  },
};

function fillTokens(s: string, vars: Record<string, string>): string {
  return s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => vars[k] ?? `{{${k}}}`);
}

function shopNameFromEmail(email: string | undefined): string {
  if (!email) return "Your shop";
  return email.split("@")[0] || "Your shop";
}

export interface PersonalEmailTarget {
  customerId: string;
  name: string;
  email: string;
  action: PersonalAction;
}

export function PersonalEmailModal({
  locale,
  target,
  shopOwnerEmail,
  onClose,
}: {
  locale: Locale;
  target: PersonalEmailTarget | null;
  shopOwnerEmail: string | undefined;
  onClose: () => void;
}) {
  const templates = locale === "bn" ? TEMPLATES_BN : TEMPLATES_EN;
  const shopName = shopNameFromEmail(shopOwnerEmail);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sentInfo, setSentInfo] = useState<{ providerId: string; to: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Hydrate fields whenever a new target opens. Pre-substitute {{name}} +
  // {{shop}} so the operator sees the final copy at-a-glance instead of
  // raw merge tags. The server re-runs the renderer with the recipient's
  // values to preserve unsubscribe + footer behavior.
  useEffect(() => {
    if (!target) return;
    const tpl = templates[target.action];
    const vars = { name: target.name || (locale === "bn" ? "প্রিয় কাস্টমার" : "there"), shop: shopName };
    setSubject(fillTokens(tpl.subject, vars));
    setBody(fillTokens(tpl.body, vars));
    setTo(target.email);
    setError("");
    setSentInfo(null);
  }, [target, locale, shopName, templates]);

  // Close on Escape + focus the dialog when it opens for keyboard users.
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  const actionLabel = useMemo(() => {
    if (!target) return "";
    return t(`ch.action.${target.action}` as const, locale);
  }, [target, locale]);

  if (!target) return null;

  const submit = async () => {
    setError("");
    setSentInfo(null);
    if (!subject.trim()) {
      setError(t("ch.email.errSubject", locale));
      return;
    }
    if (!body.trim()) {
      setError(t("ch.email.errBody", locale));
      return;
    }
    if (!to.trim()) {
      setError(t("ch.email.errTo", locale));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/customers/personal-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: target.customerId,
          action: target.action,
          subject,
          body,
          to,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.reason === "not-configured") setError(t("ch.email.errNotConfigured", locale));
        else if (data.reason === "invalid-recipient") setError(t("ch.email.errInvalidRecipient", locale));
        else setError(data.message || data.error || t("ch.email.errGeneric", locale));
        return;
      }
      setSentInfo({ providerId: data.providerId, to: data.to });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("ch.email.errGeneric", locale));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="personal-email-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 outline-none max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Mail className="w-4 h-4" />
              {actionLabel}
            </div>
            <h2 id="personal-email-title" className="text-base font-semibold text-slate-900 mt-0.5 truncate">
              {t("ch.email.title", locale)} — {target.name || t("ch.email.unknownName", locale)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {sentInfo ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-medium">{t("ch.email.sentOk", locale)}</div>
                <div className="text-emerald-700 text-xs mt-0.5">
                  {t("ch.email.sentTo", locale)} <span className="font-mono">{sentInfo.to}</span>
                </div>
                <div className="text-emerald-700 text-xs">
                  {t("ch.email.providerId", locale)}{" "}
                  <span className="font-mono">{sentInfo.providerId}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-slate-500 block mb-1">{t("ch.email.toLabel", locale)}</label>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder={t("ch.email.toPlaceholder", locale)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {!target.email && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-1">
                    {t("ch.email.noEmailOnFile", locale)}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">{t("ch.email.subjectLabel", locale)}</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">{t("ch.email.bodyLabel", locale)}</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={9}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </>
          )}

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 flex items-start gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-100"
          >
            {sentInfo ? t("ch.email.close", locale) : t("ch.email.cancel", locale)}
          </button>
          {!sentInfo && (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md px-3.5 py-1.5 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t("ch.email.send", locale)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
