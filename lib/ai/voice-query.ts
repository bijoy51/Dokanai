import { computeOverview } from "./overview";
import { rfmScores, segmentBreakdown } from "./churn";
import { forecastAll } from "./forecast";
import { festivalCalendar } from "./forecast";
import type { Locale } from "@/lib/i18n/messages";

/** Lightweight intent classifier for short Bangla / English questions. */
function detectIntent(q: string): { intent: string; lang: Locale } {
  const s = q.toLowerCase();
  // Bangla script (definitive) or unambiguous Bangla phonetic markers.
  // Avoid overlapping English words like "top" / "ki" / "koto".
  const bnPhonetic = ["bikri", "bikiri", "kotota", "aaj koto", "sobcheye", "shobcheye", "shera", "okhane", "aamar dokan"];
  const hasBnScript = /[ঀ-৿]/.test(q);
  const hasBnPhonetic = bnPhonetic.some((t) => s.includes(t));
  const isBn = hasBnScript || hasBnPhonetic;
  const lang: Locale = isBn ? "bn" : "en";

  if (/(top|সেরা|best.?selling|sera|top.?seller|sobcheye)/i.test(q)) return { intent: "top_product", lang };
  if (/(rto|return|ফেরত|return rate)/i.test(q)) return { intent: "rto", lang };
  if (/(churn|dormant|নিষ্ক্রিয়|atrisk|at.?risk)/i.test(q)) return { intent: "churn", lang };
  if (/(festival|উৎসব|ঈদ|পূজা|eid|puja|valentine)/i.test(q)) return { intent: "festival", lang };
  if (/(stock|মজুদ|inventory)/i.test(q)) return { intent: "stock", lang };
  if (/(revenue|sales|বিক্রি|আজ.*বিক্রি|aaj.*bikri|today)/i.test(q)) return { intent: "revenue", lang };
  if (/(orders|কতটা.?অর্ডার|how many orders|order count)/i.test(q)) return { intent: "orders", lang };
  if (/(customer|ক্রেতা|গ্রাহক)/i.test(q)) return { intent: "customers", lang };
  if (/(forecast|পূর্বাভাস|next week|আগামী)/i.test(q)) return { intent: "forecast", lang };
  return { intent: "fallback", lang };
}

export interface VoiceAnswer {
  text: string;
  detectedLang: Locale;
  intent: string;
}

export function answerQuery(question: string): VoiceAnswer {
  const { intent, lang } = detectIntent(question);

  if (intent === "revenue") {
    const m = computeOverview();
    const today = new Date().toISOString().slice(0, 10).slice(5);
    const todayRev = m.daily.find((d) => d.date === today)?.revenue ?? m.daily[m.daily.length - 1].revenue;
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `আজ পর্যন্ত প্রায় ${Math.round(todayRev).toLocaleString("bn-BD")} টাকা বিক্রি হয়েছে। গত ৩০ দিনে মোট ${Math.round(m.revenue30).toLocaleString("bn-BD")} টাকা।`
          : `Today's revenue is around ৳${Math.round(todayRev).toLocaleString()}. Last 30 days total: ৳${Math.round(m.revenue30).toLocaleString()}.`,
    };
  }

  if (intent === "orders") {
    const m = computeOverview();
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `গত ৩০ দিনে মোট ${m.orders30} টি অর্ডার এসেছে।`
          : `In the last 30 days you've received ${m.orders30} orders.`,
    };
  }

  if (intent === "top_product") {
    const all = forecastAll();
    const ranked = [...all].sort((a, b) => b.forecastNext7 - a.forecastNext7).slice(0, 3);
    if (lang === "bn") {
      const list = ranked.map((r) => r.nameBn).join(", ");
      return {
        intent,
        detectedLang: lang,
        text: `আগামী সপ্তাহের সেরা পণ্য: ${list}। শীর্ষ পণ্যের ৭ দিনের অনুমিত বিক্রি ${ranked[0]?.forecastNext7} ইউনিট।`,
      };
    }
    const list = ranked.map((r) => r.name).join(", ");
    return {
      intent,
      detectedLang: lang,
      text: `Top movers next week: ${list}. The leader is forecast at ${ranked[0]?.forecastNext7} units.`,
    };
  }

  if (intent === "rto") {
    const m = computeOverview();
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `আপনার বর্তমান RTO হার ${m.rtoRate.toFixed(1)} শতাংশ। উচ্চ-ঝুঁকির অর্ডারে অগ্রিম পেমেন্ট চাইলে এটি কমাতে পারেন।`
          : `Your current RTO rate is ${m.rtoRate.toFixed(1)}%. Requiring advance payment for high-risk orders reduces it.`,
    };
  }

  if (intent === "churn") {
    const seg = segmentBreakdown();
    const dormant = seg.find((s) => s.segment === "dormant")?.count ?? 0;
    const atrisk = seg.find((s) => s.segment === "atrisk")?.count ?? 0;
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `${dormant} জন ক্রেতা নিষ্ক্রিয় এবং ${atrisk} জন ঝুঁকিতে আছেন। অটো-মার্কেটিং থেকে উইন-ব্যাক ক্যাম্পেইন পাঠান।`
          : `${dormant} customers are dormant and ${atrisk} are at risk. Send a win-back campaign from Auto-Marketing.`,
    };
  }

  if (intent === "festival") {
    const fests = festivalCalendar();
    if (fests.length === 0) {
      return {
        intent,
        detectedLang: lang,
        text: lang === "bn" ? "আগামী ৬০ দিনে কোনো বড় উৎসব নেই।" : "No major festivals in the next 60 days.",
      };
    }
    const f = fests[0];
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `আসন্ন উৎসব: ${f.nameBn}, ${f.date}। ${f.adviceBn}`
          : `Next festival: ${f.name} on ${f.date}. ${f.advice}`,
    };
  }

  if (intent === "stock") {
    const all = forecastAll();
    const low = all.filter((a) => a.daysOfStock < 7 && a.stock > 0).sort((a, b) => a.daysOfStock - b.daysOfStock).slice(0, 3);
    if (low.length === 0) {
      return { intent, detectedLang: lang, text: lang === "bn" ? "কোনো পণ্যের তাত্ক্ষণিক স্টক ঝুঁকি নেই।" : "No immediate stock risks." };
    }
    const list = low.map((p) => (lang === "bn" ? p.nameBn : p.name)).join(", ");
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `কম স্টক: ${list}। শিগগিরই রিস্টক করুন।`
          : `Running low: ${list}. Restock soon.`,
    };
  }

  if (intent === "customers") {
    const seg = segmentBreakdown();
    const vip = seg.find((s) => s.segment === "vip")?.count ?? 0;
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `আপনার ${vip} জন ভিআইপি ক্রেতা আছেন। ক্রেতা ট্যাবে বিস্তারিত দেখুন।`
          : `You have ${vip} VIP customers. See the Customers tab for full breakdown.`,
    };
  }

  if (intent === "forecast") {
    const all = forecastAll();
    const total7 = all.reduce((s, a) => s + a.forecastNext7, 0);
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `আগামী ৭ দিনে আনুমানিক ${total7} ইউনিট বিক্রি হবে।`
          : `Forecast: about ${total7} units sold across all products in the next 7 days.`,
    };
  }

  return {
    intent: "fallback",
    detectedLang: lang,
    text:
      lang === "bn"
        ? "আমি বিক্রি, অর্ডার, ক্রেতা, স্টক, RTO, পূর্বাভাস ও উৎসব নিয়ে প্রশ্নের উত্তর দিতে পারি। আবার চেষ্টা করুন।"
        : "I can answer about revenue, orders, customers, stock, RTO, forecast, and festivals. Try again.",
  };
}
