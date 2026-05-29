"use client";

import { Sparkles } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * Suggestion chips shown:
 *   (a) Once below the greeting when the chat is empty — the "essential"
 *       starter prompts (initial set).
 *   (b) Below every assistant reply — a context-aware follow-up set derived
 *       from the reply's text. After a winback message is drafted, the next
 *       chip should be "Schedule it"; after at-risk customers are listed,
 *       the next chip should be "Automate emails to them"; and so on.
 *
 * Each chip's `prompt` is sent to the model in English (so tools fire
 * reliably regardless of UI locale); only the `label` is localised.
 *
 * Visual: transparent background, rounded-full border. Horizontally
 * flex-wrap to mirror the Gemini-style chips the spec referenced.
 */

export interface Suggestion {
  /** What the user sees on the chip. */
  label: string;
  /** What gets sent to /api/agent/chat when clicked (English; tool-friendly). */
  prompt: string;
  /** A short stable key for React. */
  key: string;
}

export function SuggestionChips({
  suggestions,
  onPick,
  locale,
  variant = "follow-up",
}: {
  suggestions: Suggestion[];
  onPick: (prompt: string) => void;
  locale: Locale;
  variant?: "initial" | "follow-up";
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Sparkles className="w-3 h-3" />
        {variant === "initial" ? t("pilot.tryOneOfThese", locale) : t("pilot.orTry", locale)}
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onPick(s.prompt)}
            className="text-xs sm:text-sm bg-transparent text-slate-700 border border-slate-300 hover:border-brand-500 hover:text-brand-700 rounded-full px-3 py-1 transition-colors whitespace-nowrap"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── initial chips ─────────────────────────

export function getInitialSuggestions(locale: Locale): Suggestion[] {
  const isBn = locale === "bn";
  return [
    {
      key: "overview",
      label: isBn ? "এই মাসে দোকানের সারসংক্ষেপ" : "Summarize my shop this month",
      prompt: "Give me a summary of my shop this month — revenue, orders, repeat rate, RTO rate, top product.",
    },
    {
      key: "at-risk",
      label: isBn ? "ঝুঁকিতে থাকা কাস্টমার" : "Who is at risk?",
      prompt: "List my at-risk customers with their last order date and total spend.",
    },
    {
      key: "top-products",
      label: isBn ? "টপ ৫ প্রোডাক্ট" : "Top 5 products this month",
      prompt: "Show my top 5 products by units sold in the last 30 days.",
    },
    {
      key: "low-stock",
      label: isBn ? "কম স্টক" : "Low-stock alerts",
      prompt: "Which products will run out soon? Show days-of-stock.",
    },
    {
      key: "pricing",
      label: isBn ? "প্রাইসিং পরামর্শ" : "Suggest pricing changes",
      prompt: "Suggest pricing changes for my products.",
    },
    {
      key: "winback",
      label: isBn ? "Dormant winback ইমেল" : "Send a winback email to dormant customers",
      prompt:
        "Draft a winback email for my dormant customers, ask me to confirm, then schedule it for tomorrow 6 pm.",
    },
    {
      key: "rto",
      label: isBn ? "RTO ঝুঁকি অর্ডার" : "RTO risk orders",
      prompt: "List my highest-risk pending COD orders and how much loss they could cause.",
    },
  ];
}

// ───────────────────────── follow-up chips (rule based) ─────────────────────────
//
// Heuristic: scan the assistant's reply for topic keywords, then emit
// suggestions that move the user forward naturally (the "next move").
// Deduped + capped at 4 chips so the UI stays calm.

interface Rule {
  match: RegExp;
  produce: (locale: Locale) => Suggestion[];
}

const RULES: Rule[] = [
  {
    // At-risk / dormant / RFM-style customer talk → marketing actions.
    match: /\b(at\s?-?risk|atrisk|dormant|lapsed|inactive|win[\s-]?back|churn)/i,
    produce: (locale) => [
      sugg("auto-email-them", locale,
        "Automate winback emails to these customers",
        "ঝুঁকিতে থাকা কাস্টমারদের জন্য winback ইমেল অটোমেট করো",
        "Draft a winback email for these at-risk / dormant customers, ask me to confirm, then schedule it for tomorrow 6 pm."),
      sugg("best-send-time", locale,
        "What's the best send time?",
        "সেরা পাঠানোর সময় কখন?",
        "What time of day are these customers most active? Recommend a send time."),
      sugg("their-top-cats", locale,
        "What did they used to buy?",
        "তারা আগে কী কিনত?",
        "What categories did these customers buy most often before they lapsed?"),
    ],
  },
  {
    // A campaign got scheduled (or is being discussed).
    match: /\b(schedul|campaign|cron worker|will fire|email sent|mk_[a-z0-9_]+)/i,
    produce: (locale) => [
      sugg("campaign-status", locale,
        "Show the campaign status",
        "ক্যাম্পেইনের স্ট্যাটাস দেখাও",
        "Show the status of my most recent scheduled campaign."),
      sugg("cancel-it", locale,
        "Cancel it",
        "বাতিল করো",
        "Cancel my most recent scheduled campaign."),
      sugg("schedule-next", locale,
        "Schedule another for next week",
        "পরের সপ্তাহের জন্য আরেকটি শিডিউল করো",
        "Schedule a follow-up email to the same audience for next week, same time. Draft it first."),
    ],
  },
  {
    // Top products / best sellers / units sold.
    match: /\b(top\s+(?:5|10|product|sell)|best[\s-]?sell|units\s+sold)/i,
    produce: (locale) => [
      sugg("pricing-from-top", locale,
        "Suggest pricing changes",
        "প্রাইসিং পরামর্শ দাও",
        "Suggest pricing changes for my top-selling products."),
      sugg("low-stock-after-top", locale,
        "Any of these low on stock?",
        "এদের কোনটির স্টক কম?",
        "Which of my top sellers are running low on stock?"),
      sugg("bundles-from-top", locale,
        "Find bundle opportunities",
        "বান্ডেলের সুযোগ খুঁজে দাও",
        "Suggest product bundles based on co-purchase patterns."),
    ],
  },
  {
    // Low stock / days of stock / forecast running out.
    match: /\b(low[\s-]?stock|days[\s-]?of[\s-]?stock|run\s+out|restock)/i,
    produce: (locale) => [
      sugg("bundles-clear-stock", locale,
        "Suggest bundles to move stock",
        "স্টক মুভ করতে বান্ডেল পরামর্শ",
        "Suggest product bundles that would help me move slow-moving stock alongside best sellers."),
      sugg("forecast-14d", locale,
        "Forecast next 14 days",
        "পরের ১৪ দিনের ফোরকাস্ট",
        "Show me the total units forecast for the next 14 days."),
    ],
  },
  {
    // RTO / COD / return-to-origin.
    match: /\b(rto|return[\s-]?to[\s-]?origin|cod\s+risk|pending\s+cod)/i,
    produce: (locale) => [
      sugg("rto-projection", locale,
        "Projected RTO loss",
        "RTO ক্ষতির হিসাব",
        "Show me the projected RTO loss and how much I can avoid by requiring advance payment."),
      sugg("rto-require-advance", locale,
        "Which orders should require advance?",
        "কোন অর্ডারে অগ্রিম পেমেন্ট চাইব?",
        "List the pending COD orders that should require advance payment."),
    ],
  },
  {
    // Pricing / raise / lower / elasticity.
    match: /\b(pricing|elasticity|raise.*price|lower.*price|markup|margin)/i,
    produce: (locale) => [
      sugg("bundles-from-pricing", locale,
        "Show bundle suggestions",
        "বান্ডেল পরামর্শ দেখাও",
        "Suggest product bundles based on co-purchase patterns."),
      sugg("vip-recs", locale,
        "VIP recommendations",
        "VIP কাস্টমারদের রেকমেন্ডেশন",
        "Show recommendations for my VIP customers."),
    ],
  },
  {
    // VIP / top customers.
    match: /\b(vip|top\s+customer|loyal|best\s+customer)/i,
    produce: (locale) => [
      sugg("email-vip", locale,
        "Send a thank-you email to VIPs",
        "VIP-দের ধন্যবাদ ইমেল",
        "Draft a thank-you email for my VIP customers, confirm with me, then schedule it for tomorrow 6 pm."),
      sugg("recs-for-them", locale,
        "Recommendations for them",
        "তাদের জন্য রেকমেন্ডেশন",
        "Show personalised product recommendations for my top customers."),
    ],
  },
  {
    // Forecast / future demand.
    match: /\bforecast/i,
    produce: (locale) => [
      sugg("top-now", locale,
        "Top products right now",
        "এখনকার টপ প্রোডাক্ট",
        "Show my top 5 products by units sold in the last 30 days."),
      sugg("low-now", locale,
        "Low stock alerts",
        "কম স্টক সতর্কতা",
        "Which products will run out soon? Show days-of-stock."),
    ],
  },
];

// Defaults shown when nothing else matches — keeps the user moving.
function defaults(locale: Locale): Suggestion[] {
  return [
    sugg("def-overview", locale,
      "Summarize my shop",
      "আমার দোকানের সারসংক্ষেপ",
      "Give me a summary of my shop this month."),
    sugg("def-atrisk", locale,
      "Who is at risk?",
      "ঝুঁকিতে কারা?",
      "List my at-risk customers."),
    sugg("def-top", locale,
      "Top products",
      "টপ প্রোডাক্ট",
      "Show my top 5 products by units sold in the last 30 days."),
  ];
}

function sugg(key: string, locale: Locale, en: string, bn: string, prompt: string): Suggestion {
  return { key, label: locale === "bn" ? bn : en, prompt };
}

/** Returns up to 4 deduped chips for what the user might want to do next. */
export function getFollowUpSuggestions(assistantText: string, locale: Locale): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    if (!rule.match.test(assistantText)) continue;
    for (const s of rule.produce(locale)) {
      if (seen.has(s.key)) continue;
      seen.add(s.key);
      out.push(s);
      if (out.length >= 4) return out;
    }
  }
  if (out.length === 0) return defaults(locale);
  // Pad with one or two defaults if we have fewer than 3 follow-ups.
  for (const s of defaults(locale)) {
    if (out.length >= 4) break;
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    out.push(s);
  }
  return out;
}
